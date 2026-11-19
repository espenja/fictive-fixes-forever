const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require(process.argv[2] || "fengari");

const addonPath = path.resolve(__dirname, "..");
const auctionatorPath = path.resolve(addonPath, "..", "Auctionator");
const modulePath = path.join(addonPath, "Modules", "TooltipPriceDifference.lua");

const mocks = `
  messages, hookCount, shiftDown = {}, 0, false
  item = {vendor = 6, auction = 140}
  config = {VENDOR_TOOLTIPS = true, AUCTION_TOOLTIPS = true, SHIFT_STACK_TOOLTIPS = true}
  local function color(code)
    return {WrapTextInColorCode = function(_, text) return code .. text .. "|r" end}
  end
  WHITE_FONT_COLOR = color("|cffffffff")
  LIGHTBLUE_FONT_COLOR = color("|cff00aaff")
  function wipe(t) for k in pairs(t) do t[k] = nil end end
  function IsShiftKeyDown() return shiftDown end
  function hooksecurefunc(object, key, callback)
    hookCount = hookCount + 1
    local original = object[key]
    object[key] = function(...)
      original(...)
      callback(...)
    end
  end
  local Addon = {}
  function Addon:Print(message) messages[#messages + 1] = message end
  function Addon:NewModule()
    Module = {enabled = true, events = {}}
    function Module:IsEnabled() return self.enabled end
    function Module:RegisterEvent(event, method) self.events[event] = method end
    function Module:UnregisterEvent(event) self.events[event] = nil end
    return Module
  end
  namespace = {Addon = Addon}
  Auctionator = {
    Tooltip = {}, Utilities = {},
    Locales = {Apply = function(key) return ({VENDOR="Vendor", AUCTION="Auction", UNKNOWN="Unknown"})[key] or key end},
    Config = {Options = setmetatable({}, {__index = function(_, key) return key end}),
      Get = function(key) return config[key] end},
    Constants = {IsRetail = true, ITEM_INFO = {SELL_PRICE = 11}},
    Debug = {IsOn = function() return false end},
    Enchant = {DisenchantStatus = function() end, GetDisenchantAuctionPrice = function() end},
    Database = {
      GetFirstPrice = function() return item.auction end,
      GetPriceAge = function() return 0 end,
      GetMeanPrice = function() return item.mean end,
    },
  }
  function Auctionator.Utilities.IsPetDBKey() return false end
  function Auctionator.Utilities.IsBound() return item.bound or false end
  function Auctionator.Utilities.IsVendorable() return item.vendor ~= nil and item.vendor > 0 end
  C_Item = {GetItemInfo = function()
    return table.unpack({[1] = "Item", [11] = item.vendor}, 1, 11)
  end}
  function newTooltip()
    return {lines = {}, AddDoubleLine = function(self, left, right)
      self.lines[#self.lines + 1] = {left, right}
    end}
  end
  function render(count)
    local tooltip = newTooltip()
    Auctionator.Tooltip.ShowTipWithPricingDBKey(tooltip, {"item"}, "item:1", count or 1)
    return tooltip
  end
  function expectDifference(tooltip, value, suffix)
    local line = tooltip.lines[3]
    assert(line and line[1] == "Auction - vendor" .. (suffix or ""), "Wrong comparison position or count")
    local color = value > 0 and "|cff00ff00" or value < 0 and "|cffff0000" or "|cffffff00"
    local sign = value > 0 and "+" or value < 0 and "-" or ""
    local money = Auctionator.Utilities.CreatePaddedMoneyString(math.abs(value))
    assert(line[2] == color .. sign .. money .. "|r", "Wrong difference, color, sign or coin format")
  end
`;

function run(name, test) {
  const state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);
  function execute(source, filename, isModule = false) {
    let status = lauxlib.luaL_loadbuffer(state, to_luastring(source), null, to_luastring(filename));
    if (status === lua.LUA_OK) {
      if (isModule) {
        lua.lua_pushstring(state, to_luastring("FictiveFixesForever"));
        lua.lua_getglobal(state, to_luastring("namespace"));
      }
      status = lua.lua_pcall(state, isModule ? 2 : 0, 0, 0);
    }
    if (status !== lua.LUA_OK) {
      throw new Error(`${name}: ${to_jsstring(lua.lua_tostring(state, -1))}`);
    }
  }
  try {
    execute(mocks, "mocks");
    for (const relativePath of [
      ["Source", "Utilities", "CreatePaddedMoneyString.lua"],
      ["Source", "Utilities", "CreateCountString.lua"],
      ["Source", "Tooltips", "Main.lua"],
    ]) {
      const filename = path.join(auctionatorPath, ...relativePath);
      execute(fs.readFileSync(filename, "utf8"), filename);
    }
    execute(fs.readFileSync(modulePath, "utf8"), modulePath, true);
    execute(test, name);
    console.log(`PASS: ${name}`);
  } finally {
    lua.lua_close(state);
  }
}

run("source integration, arithmetic, colors and exact insertion point", `
  Module:OnEnable()
  local tip = render()
  assert(tip.lines[1][1] == "Vendor" and tip.lines[2][1] == "Auction")
  expectDifference(tip, 134)
  item.auction = 4
  expectDifference(render(), -2)
  item.auction = 6
  expectDifference(render(), 0)
  item.auction = 0
  expectDifference(render(), -6)
  item.auction = 140.9
  expectDifference(render(), 134)
  config.AUCTION_MEAN_TOOLTIPS, item.mean = true, 150
  tip = render()
  expectDifference(tip, 134)
  assert(tip.lines[4][1] == "AUCTION_MEAN", "Comparison must precede later Auctionator lines")
`);

run("stack and Shift behavior follows Auctionator", `
  Module:OnEnable()
  expectDifference(render(18), 134)
  shiftDown = true
  local suffix = Auctionator.Utilities.CreateCountString(18)
  expectDifference(render(18), 2412, suffix)
  config.SHIFT_STACK_TOOLTIPS = false
  expectDifference(render(18), 134)
  shiftDown = false
  expectDifference(render(18), 2412, suffix)
`);

run("unknown, bound, unvendorable and hidden-auction cases", `
  Module:OnEnable()
  item.auction = nil
  assert(#render().lines == 2)
  item.auction, item.bound = 140, true
  assert(#render().lines == 1)
  item.bound, item.vendor = false, nil
  assert(#render().lines == 1)
  item.vendor, config.AUCTION_TOOLTIPS = 6, false
  assert(#render().lines == 1)
  config.AUCTION_TOOLTIPS, config.VENDOR_TOOLTIPS = true, false
  local tip = render()
  assert(#tip.lines == 2 and tip.lines[2][1] == "Auction - vendor")
`);

run("per-tooltip isolation, consumed prices and mismatched units", `
  Module:OnEnable()
  local first, second = newTooltip(), newTooltip()
  Auctionator.Tooltip.AddVendorTip(first, 6, "")
  Auctionator.Tooltip.AddVendorTip(second, 10, "")
  Auctionator.Tooltip.AddAuctionTip(first, 140, "", false)
  Auctionator.Tooltip.AddAuctionTip(second, 8, "", false)
  expectDifference(first, 134)
  expectDifference(second, -2)
  Auctionator.Tooltip.AddAuctionTip(first, 150, "", false)
  assert(#first.lines == 4, "Consumed vendor data must not be reused")
  local mismatch = newTooltip()
  Auctionator.Tooltip.AddVendorTip(mismatch, 6, "")
  Auctionator.Tooltip.AddAuctionTip(mismatch, 140, " x18", false)
  assert(#mismatch.lines == 2, "Do not compare mismatched quantities")
`);

run("disable/re-enable does not leak prices or duplicate hooks", `
  Module:OnEnable()
  assert(#render().lines == 3 and hookCount == 2)
  local pending = newTooltip()
  Auctionator.Tooltip.AddVendorTip(pending, 6, "")
  Module.enabled = false
  Module:OnDisable()
  assert(#render().lines == 2)
  Module.enabled = true
  Module:OnEnable()
  Auctionator.Tooltip.AddAuctionTip(pending, 140, "", false)
  assert(#pending.lines == 2)
  assert(#render().lines == 3 and hookCount == 2)
`);

run("missing, late-loaded and incompatible Auctionator", `
  local saved = Auctionator
  Auctionator = nil
  Module:OnEnable()
  assert(hookCount == 0 and #messages == 1)
  assert(Module.events.ADDON_LOADED == "OnAddonLoaded")
  Module:OnAddonLoaded("ADDON_LOADED", "OtherAddon")
  assert(hookCount == 0)
  Auctionator = saved
  Module:OnAddonLoaded("ADDON_LOADED", "Auctionator")
  assert(hookCount == 2 and Module.events.ADDON_LOADED == nil)
  expectDifference(render(), 134)
  Module.enabled = false
  Module:OnDisable()
  local previousModule = Module
  namespace.Addon:NewModule()
  for _, name in ipairs({"OnEnable", "OnDisable", "HookAuctionator"}) do
    Module[name] = previousModule[name]
  end
  Auctionator = {Tooltip = {}}
  Module:OnEnable()
  assert(hookCount == 2 and #messages == 2)
`);

assert(fs.readFileSync(path.join(addonPath, "Modules", "Modules.xml"), "utf8").includes('file="TooltipPriceDifference.lua"'));
console.log("All tooltip comparison tests passed using the installed Fengari runtime.");
