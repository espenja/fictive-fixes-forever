const fs = require("node:fs");
const path = require("node:path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require(process.argv[2] || "fengari");
const addonPath = path.resolve(__dirname, "..");
const workspace = path.dirname(addonPath);

const mocks = `
  UIParent, messages, itemLookups, priceQueries, requests = {}, {}, 0, 0, {}
  catalog, prices = {}, {}
  LE_ITEM_BIND_NONE, LE_ITEM_BIND_ON_EQUIP, LE_ITEM_BIND_ON_USE = 0, 2, 3
  Enum = {ItemBind = {None = 0, OnEquip = 2, OnUse = 3}, ItemQuality = {Artifact = 6, Legendary = 5}}
  function tIndexOf(t, value) for i, v in ipairs(t) do if v == value then return i end end end
  function date() return "12:34:56" end
  C_Container = {GetContainerNumSlots = function() return 0 end}
  C_Item = {
    GetItemInfo = function(link)
      itemLookups = itemLookups + 1
      local entry = catalog[link]
      if entry and not entry.uncached then return table.unpack(entry.info, 1, 17) end
    end,
    RequestLoadItemDataByID = function(id) requests[id] = true end,
    IsItemBindToAccountUntilEquip = function(link) return catalog[link].accountBound end,
  }
  function defineItem(id, vendor, auction, bind, accountBound)
    local link = "item:" .. id
    catalog[link] = {info = {[1] = "Item", [2] = link, [3] = 1, [11] = vendor, [14] = bind or 0}, accountBound = accountBound}
    prices[link] = auction
    return link
  end
  function slot(id, count, bound)
    return {itemID = id, itemLink = "item:" .. id, itemCount = count, isBound = bound}
  end
  SYNDICATOR_DATA = {
    Characters = {
      ["Current-Realm"] = {bags = {}, bank = {}, bankTabs = {}},
      ["Alt-Realm"] = {bags = {{slot(1, 999, false)}}},
    },
    Warband = {{bank = {{slots = {slot(1, 999, false)}}}}},
  }
  current = SYNDICATOR_DATA.Characters["Current-Realm"]
  Syndicator = {API = {}, Constants = {CharacterBankTabsActive = true}}
  syndicatorTable = {
    Constants = {}, Tracking = {isReady = true},
    BagCache = {currentCharacter = "Current-Realm", isUpdatePending = false},
  }
  Auctionator = {
    API = {v1 = {}}, Utilities = {},
    Constants = {ITEM_INFO = {SELL_PRICE = 11, BIND_TYPE = 14, REAGENT = 17, RARITY = 3}},
    Database = {GetFirstPrice = function(_, keys) priceQueries = priceQueries + 1; return prices[keys[1]] end},
  }
  function Auctionator.Utilities.DBKeyFromLink(link, callback) callback({link}) end
  function Auctionator.Utilities.BasicDBKeyFromLink(link) return link end
  local Addon = {}
  function Addon:Print(message) messages[#messages + 1] = message end
  function Addon:NewModule()
    Module = {events = {}, enabled = true}
    function Module:IsEnabled() return self.enabled end
    function Module:RegisterEvent(event, method) self.events[event] = method end
    function Module:UnregisterEvent(event) self.events[event] = nil end
    function Module:Enable() self.enabled = true; self:OnEnable() end
    function Module:Disable() self.enabled = false; self:OnDisable(); self.events = {} end
    return Module
  end
  namespace = {Addon = Addon}
  bagFrames, skinListeners = {}, {}
  Baganator = {API = {Skins = {
    GetAllFrames = function() return bagFrames end,
    RegisterListener = function(listener) skinListeners[#skinListeners + 1] = listener end,
  }}}
  function CreateFrame(kind, name, parent)
    local frame = {parent = parent, shown = true, hooks = {}, scripts = {}}
    function frame:SetSize(width, height)
      self.width, self.height = width, height
      for _, callback in ipairs(self.hooks.OnSizeChanged or {}) do callback(self, width, height) end
    end
    function frame:SetHeight(height) self:SetSize(self.width or 0, height) end
    function frame:GetHeight() return self.height or 0 end
    function frame:SetPoint(...) self.point = {...} end
    function frame:ClearAllPoints() self.point = nil end
    function frame:SetClampedToScreen() end
    function frame:SetBackdrop() end
    function frame:SetBackdropColor() end
    function frame:GetFrameLevel() return self.level or 1 end
    function frame:SetFrameLevel(level) self.level = level end
    function frame:SetParent(value) self.parent = value end
    function frame:GetParent() return self.parent end
    function frame:IsShown() return self.shown end
    function frame:SetShown(shown) if shown then self:Show() else self:Hide() end end
    function frame:HookScript(event, callback)
      self.hooks[event] = self.hooks[event] or {}
      table.insert(self.hooks[event], callback)
    end
    function frame:Show()
      local changed = not self.shown
      self.shown = true
      if changed then for _, callback in ipairs(self.hooks.OnShow or {}) do callback(self) end end
    end
    function frame:Hide()
      local changed = self.shown
      self.shown = false
      if changed then for _, callback in ipairs(self.hooks.OnHide or {}) do callback(self) end end
    end
    function frame:SetScript(event, callback) self.scripts[event] = callback end
    function frame:SetText(value) self.text = value end
    function frame:CreateFontString()
      local text = {}
      function text:SetPoint() end
      function text:SetWidth() end
      function text:SetJustifyH() end
      function text:SetText(value) self.value = value end
      function text:GetStringHeight() return #self.value / 4 end
      return text
    end
    return frame
  end
  function newBag(shown, tag)
    local frame = CreateFrame("Frame", nil, UIParent)
    frame.shown = shown
    local details = {regionType = "ButtonFrame", region = frame, tags = {tag or "backpack"}}
    bagFrames[#bagFrames + 1] = details
    for _, listener in ipairs(skinListeners) do listener(details) end
    return frame
  end
`;

function run(name, test) {
  const state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);
  function execute(source, filename, namespaceName) {
    let status = lauxlib.luaL_loadbuffer(state, to_luastring(source), null, to_luastring(filename));
    if (status === lua.LUA_OK) {
      if (namespaceName) {
        lua.lua_pushstring(state, to_luastring("FictiveFixesForever"));
        lua.lua_getglobal(state, to_luastring(namespaceName));
      }
      status = lua.lua_pcall(state, namespaceName ? 2 : 0, 0, 0);
    }
    if (status !== lua.LUA_OK) throw new Error(`${name}: ${to_jsstring(lua.lua_tostring(state, -1))}`);
  }
  function file(relative, namespaceName) {
    const filename = path.join(workspace, ...relative);
    execute(fs.readFileSync(filename, "utf8"), filename, namespaceName);
  }
  try {
    execute(mocks, "mocks");
    file(["Syndicator", "API", "Main.lua"], "syndicatorTable");
    file(["Auctionator", "Source", "API", "Internal.lua"]);
    file(["Auctionator", "Source", "API", "v1", "GetAuctionPrice.lua"]);
    file(["Auctionator", "Source", "Utilities", "IsBound.lua"]);
    file(["Auctionator", "Source", "Utilities", "IsVendorable.lua"]);
    file(["Auctionator", "Source", "Utilities", "CreatePaddedMoneyString.lua"]);
    file(["FictiveFixesForever", "Modules", "BagValue.lua"], "namespace");
    execute(test, name);
    console.log(`PASS: ${name}`);
  } finally {
    lua.lua_close(state);
  }
}

run("cached tabbed bank, per-stack binding and best-price totals without double-counting", `
  defineItem(1, 6, 140)
  defineItem(2, 100, 80, 2)
  defineItem(3, 10, 200, 1)
  defineItem(4, 5, 200, 2, true)
  defineItem(5, 0, 20)
  defineItem(6, 0, 200, 1)
  defineItem(7, 50, nil)
  current.bags = {{slot(1, 18, false), slot(1, 2, true), slot(2, 3, false),
    slot(3, 4, false), slot(4, 2, false), slot(5, 5, false), slot(6, 7, true), {}}}
  current.bankTabs = {{slots = {slot(1, 10, false), slot(2, 1, true), slot(7, 2, false)}}}
  current.bank = {{slot(1, 999, false)}}
  local result, message = Module:CalculateValue()
  assert(result, message)
  assert(result.character == "Current-Realm" and result.bankCached)
  assert(result.both.count == 33 and result.both.vendor == 568 and result.both.auction == 4160)
  assert(result.vendorOnly.count == 9 and result.vendorOnly.vendor == 162)
  assert(result.auctionOnly.count == 5 and result.auctionOnly.auction == 100)
  assert(result.best == 4582, "Best total must choose per-stack values, not add vendor and auction")
  assert(result.both.unpriced == 2, "Missing auction prices must be counted")
  assert(priceQueries == 4, "Price each auctionable link once and never query bound-only items")
`);

run("legacy bank bags and sparse slots are included instead of bank tabs", `
  Syndicator.Constants.CharacterBankTabsActive = false
  defineItem(1, 6, 140)
  current.bags = {{[4] = slot(1, 2, false)}}
  current.bank = {[1] = {[7] = slot(1, 3, true)}, [4] = {slot(1, 1, false)}}
  current.bankTabs = {{slots = {slot(1, 999, false)}}}
  local result = assert(Module:CalculateValue())
  assert(result.both.count == 3 and result.vendorOnly.count == 3)
  assert(result.best == 438 and result.bankCached)
`);

run("uncached metadata, missing binding and missing market prices stay explicit", `
  defineItem(1, 6, 140)
  defineItem(2, 10, 100)
  catalog["item:2"].uncached = true
  defineItem(3, 7, nil)
  defineItem(4, 0, nil)
  current.bags = {{slot(1, 2, nil), slot(2, 3, false), slot(3, 4, false),
    slot(4, 5, false), {itemID = 5, itemCount = 6}}}
  local result = assert(Module:CalculateValue())
  assert(result.missingBinding == 2 and result.missingData == 9)
  assert(result.both.unpriced == 4 and result.auctionOnly.unpriced == 5)
  assert(result.best == 28 and not result.bankCached)
  assert(requests[2] and requests[5], "Only a manual calculation may request uncached item data")
`);

run("manual-only refresh, top-center anchoring and preserved results on failure", `
  defineItem(1, 6, 140)
  current.bags = {{slot(1, 2, false)}}
  local bag = newBag(false)
  Module:Enable()
  assert(Module.panel == nil and itemLookups == 0)
  bag:Show()
  assert(Module.panel:GetParent() == bag and Module.panel:IsShown())
  local point = Module.panel.point
  assert(point[1] == "BOTTOM" and point[2] == bag and point[3] == "TOP" and point[4] == 0)
  assert(Module.result == nil and itemLookups == 0 and priceQueries == 0)
  Module.toggleButton.scripts.OnClick()
  Module.refreshButton.scripts.OnClick()
  assert(Module.result.best == 280 and Module.totalText.value == Auctionator.Utilities.CreatePaddedMoneyString(280))
  assert(Module.statusText.value:find("Bank not cached", 1, true))
  local lookups = itemLookups
  current.bags[1][1].itemCount = 5
  bag:Hide()
  assert(not Module.panel:IsShown())
  bag:Show()
  assert(Module.result.best == 280 and itemLookups == lookups, "Bag events must not recalculate")
  Module.refreshButton.scripts.OnClick()
  assert(Module.result.best == 700)
  syndicatorTable.BagCache.isUpdatePending = true
  Module.refreshButton.scripts.OnClick()
  assert(Module.result.best == 700 and Module.statusText.value:find("Refresh failed", 1, true))
  syndicatorTable.BagCache.isUpdatePending = false
  prices["item:1"] = nil
  Module.refreshButton.scripts.OnClick()
  assert(Module.result.best == 30 and Module.rows.both.auction.value:find("*", 1, true))
`);

run("refresh renders every row using Auctionator money formatting without the missing client API", `
  assert(GetCoinTextureString == nil)
  defineItem(1, 6, 140)
  current.bags = {{slot(1, 18, false)}}
  newBag(true)
  Module:Enable()
  Module.toggleButton.scripts.OnClick()
  Module.refreshButton.scripts.OnClick()
  local money = Auctionator.Utilities.CreatePaddedMoneyString
  assert(Module.rows.both.vendor.value == money(108))
  assert(Module.rows.both.auction.value == money(2520))
  assert(Module.rows.vendorOnly.vendor.value == money(0))
  assert(Module.rows.vendorOnly.auction.value == "--")
  assert(Module.rows.auctionOnly.vendor.value == "--")
  assert(Module.rows.auctionOnly.auction.value == money(0))
  assert(Module.totalText.value == money(2520))
  assert(Module.statusText.value:find("Refreshed", 1, true))
`);

run("collapse and expand preserve totals without covering the bag-slot attachment", `
  defineItem(1, 6, 140)
  current.bags = {{slot(1, 2, false)}}
  local bag = newBag(true)
  bag.BagSlots = CreateFrame("Frame", nil, bag)
  bag.BagSlots:SetSize(180, 40)
  Module:Enable()
  assert(Module.collapsed and Module.toggleButton.text == "Expand")
  assert(not Module.content:IsShown() and not Module.refreshButton:IsShown())
  local compactHeight = Module.panel:GetHeight()
  assert(Module.panel.point[5] > bag.BagSlots:GetHeight(), "Leave room for the visible attachment")
  Module.toggleButton.scripts.OnClick()
  assert(not Module.collapsed and Module.toggleButton.text == "Collapse")
  assert(Module.content:IsShown() and Module.refreshButton:IsShown())
  assert(Module.panel:GetHeight() > compactHeight and itemLookups == 0)
  Module.refreshButton.scripts.OnClick()
  local result, lookups, queries = Module.result, itemLookups, priceQueries
  Module.toggleButton.scripts.OnClick()
  assert(Module.panel:GetHeight() == compactHeight)
  bag:Hide()
  bag:Show()
  assert(Module.collapsed and not Module.content:IsShown())
  Module.toggleButton.scripts.OnClick()
  assert(Module.result == result and itemLookups == lookups and priceQueries == queries)
  bag.BagSlots:Hide()
  assert(Module.panel.point[5] == 4)
  bag.BagSlots:Show()
  assert(Module.panel.point[5] > 40)
  bag.BagSlots:SetHeight(60)
  assert(Module.panel.point[5] > 60)
  assert(itemLookups == lookups and priceQueries == queries, "Attachment changes must not calculate")
`);

run("skin/layout changes and module toggles do not duplicate hooks or recalculate", `
  local first = newBag(true)
  Module:Enable()
  assert(Module.panel:GetParent() == first)
  local second = newBag(false)
  first:Hide()
  second:Show()
  assert(Module.panel:GetParent() == second)
  local bank = newBag(true, "bank")
  assert(Module.panel:GetParent() == second, "Ignore bank windows")
  Module:Disable()
  assert(not Module.panel:IsShown())
  second:Hide()
  second:Show()
  assert(not Module.panel:IsShown())
  local nextSkin = newBag(false)
  Module:Enable()
  assert(#skinListeners == 1 and #second.hooks.OnShow == 1)
  second:Hide()
  nextSkin:Show()
  assert(Module.panel:GetParent() == nextSkin and Module.panel:IsShown())
  assert(itemLookups == 0 and priceQueries == 0, "UI lifecycle must not calculate prices")
`);

run("dependency readiness, invalid snapshots and late Baganator loading report failures", `
  syndicatorTable.Tracking.isReady = false
  local result, message = Module:CalculateValue()
  assert(not result and message:find("not ready", 1, true))
  syndicatorTable.Tracking.isReady = true
  local savedAuctionator = Auctionator
  Auctionator = nil
  result, message = Module:CalculateValue()
  assert(not result and message:find("Auctionator", 1, true))
  Auctionator = savedAuctionator
  current.bags = {{slot(1, 0, false)}}
  result, message = Module:CalculateValue()
  assert(not result and message:find("stack count", 1, true))
  current.bags, current.bankTabs = {}, {{}}
  result, message = Module:CalculateValue()
  assert(not result and message:find("snapshot", 1, true))
  local savedBaganator = Baganator
  Baganator = nil
  Module:Enable()
  assert(#messages == 1 and Module.events.ADDON_LOADED)
  Baganator = savedBaganator
  Module:OnAddonLoaded("ADDON_LOADED", "Baganator")
  assert(Module.events.ADDON_LOADED == nil and #skinListeners == 1)
`);

console.log("All bag value tests passed using the installed Fengari runtime.");
