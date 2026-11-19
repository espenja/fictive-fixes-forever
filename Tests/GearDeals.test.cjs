const fs = require("node:fs");
const path = require("node:path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require(process.argv[2] || "fengari");
const addon = path.resolve(__dirname, "..");
const state = lauxlib.luaL_newstate();
lualib.luaL_openlibs(state);

function execute(source, label) {
  const status = lauxlib.luaL_dostring(state, to_luastring(source));
  if (status !== lua.LUA_OK) throw new Error(`${label}: ${to_jsstring(lua.lua_tostring(state, -1))}`);
}

function load(filename, args = "") {
  execute(`assert(load(${JSON.stringify(fs.readFileSync(filename, "utf8"))}, "@${path.basename(filename)}"))(${args})`, filename);
}

try {
  execute(`
    local function forbidden() error("Gear Deals must not call auction actions") end
    C_AuctionHouse = setmetatable({}, {__index = forbidden})
    PlaceAuctionBid, BuyAuctionItem, QueryAuctionItems = forbidden, forbidden, forbidden
    Enum = {ItemClass = {Weapon = 2, Armor = 4}}
    local function noop() end
    function time() return 100 end
    function date(_, value) return tostring(value) end
    function tIndexOf(t, value)
      for i, v in ipairs(t) do if v == value then return i end end
    end
    function CreateAndInitFromMixin(mixin)
      local object = setmetatable({}, {__index = mixin})
      object:Init()
      return object
    end
    Auctionator = {
      Debug = {Message = noop}, Utilities = {Slice = function(t, a, b) return {table.unpack(t, a, b)} end},
      FullScan = {Events = {ScanComplete = "complete"}},
      IncrementalScan = {Events = {
        ScanComplete = "full_incremental_scan_complete", PricesProcessed = "prices_processed",
      }},
    }
    catalog, requested = {}, {}
    C_Item = {}
    local function getItem(reference)
      return catalog[type(reference) == "number" and "item:" .. reference or reference]
    end
    function C_Item.GetItemInfoInstant(link)
      local item = getItem(link)
      return item.id, nil, nil, item.slot, nil, item.class
    end
    function C_Item.GetItemInfo(link)
      local item = getItem(link)
      if not item.pending then
        return item.name, type(link) == "number" and "item:" .. link or link,
          nil, nil, nil, nil, item.subtype, nil, nil, nil, item.vendor
      end
    end
    function C_Item.GetDetailedItemLevelInfo(link) return getItem(link).level end
    function C_Item.GetItemStats(link) return getItem(link).stats end
    function C_Item.RequestLoadItemDataByID(id) requested[id] = true end
    local gui = {}
    local frame = {textures = {}}
    function frame:CreateTexture()
      local texture = {}
      function texture:SetColorTexture(_, _, _, alpha) self.opacity = alpha end
      function texture:SetTexture(file) self.image = file end
      function texture:Show() self.shown = true end
      function texture:Hide() self.shown = false end
      for _, key in ipairs({"SetPoint", "SetAllPoints", "SetHorizTile", "SetVertTile", "SetAlpha"}) do
        texture[key] = noop
      end
      self.textures[#self.textures + 1] = texture
      return texture
    end
    function gui:Create(kind)
      local widget = {kind = kind, children = {}, callbacks = {}, userData = {}}
      if kind == "Frame" then widget.frame = frame end
      function widget:SetCallback(event, fn) self.callbacks[event] = fn end
      function widget:AddChild(child) self.children[#self.children + 1] = child end
      function widget:ReleaseChildren() self.children = {} end
      function widget:SetText(text) self.text = text end
      function widget:SetDisabled(disabled) self.disabled = disabled end
      function widget:SetList(values, order) self.values, self.order, self.checked = values, order, {} end
      function widget:SetUserData(key, value) self.userData[key] = value end
      function widget:GetUserData(key) return self.userData[key] end
      function widget:SetMultiselect(enabled) self.multiselect = enabled end
      function widget:SetItemValue(key, value)
        assert(self.multiselect and self.values[key] and value)
        self.checked[key] = value
      end
      function widget:Hide() self.callbacks.OnClose(self) end
      for _, key in ipairs({"SetTitle", "SetWidth", "SetHeight", "SetLayout", "SetFullWidth",
          "SetRelativeWidth", "SetLabel", "DisableButton", "SetValue", "Show"}) do
        widget[key] = noop
      end
      return widget
    end
    function gui:Release(widget) widget:ReleaseChildren() end
    function LibStub(name) assert(name == "AceGUI-3.0"); return gui end
    local Addon = {db = {}, commands = {}}
    function Addon:NewModule()
      Module = {enabled = true, RegisterEvent = noop, UnregisterEvent = noop}
      function Module:IsEnabled() return self.enabled end
      return Module
    end
    function Addon.db:RegisterNamespace(_, defaults)
      saved = saved or defaults
      return saved
    end
    function Addon:RegisterChatCommand(name, callback) self.commands[name] = callback end
    function Addon:UnregisterChatCommand(name) self.commands[name] = nil end
    Addon.Print = noop
    namespace = {Addon = Addon}
    function item(id, name, class, slot, level, vendor, agility, strength)
      local link = "item:" .. id
      catalog[link] = {id = id, name = name, class = class, slot = slot, level = level, vendor = vendor,
        subtype = class == 2 and "Swords" or "Plate",
        stats = {ITEM_MOD_AGILITY_SHORT = agility, ITEM_MOD_STRENGTH_SHORT = strength}}
      return link
    end
    function row(link, quantity, buyout, legacy)
      return {itemLink = link, [legacy and "auctionInfo" or "replicateInfo"] = {[3] = quantity, [10] = buyout}}
    end
    function gearFilter(weapons, slots, types)
      return {weapons = weapons or {}, slots = slots or {}, types = types or {}}
    end
    function click(parent, text)
      for _, child in ipairs(parent.children) do
        if child.kind == "Button" and child.text == text and not child.disabled then
          child.callbacks.OnClick(child)
          return
        end
      end
      error("No enabled button: " .. text)
    end
  `, "mocks");
  load(path.join(addon, "..", "Auctionator", "Source", "Utilities", "EventBusMixin.lua"));
  const modulePath = path.join(addon, "Modules", "GearDeals.lua");
  load(modulePath, '"FictiveFixesForever", namespace');
  execute(`
    Module:OnInitialize()
    Module:OnEnable()
    local source, bus = {}, Auctionator.EventBus
    bus:RegisterSource(source, "scan")
    local sword = item(1, "Quickblade", 2, "INVTYPE_WEAPONMAINHAND", 30, 118000, 4)
    local greatsword = item(2, "Longblade", 2, "INVTYPE_2HWEAPON", 35, 100000, 2, 5)
    local armor = item(3, "Sturdy Plate", 4, "INVTYPE_CHEST", 32, 5000, nil, 4)
    local other = item(4, "Crafting Powder", 7, "", 35, 100000)
    local delayed = item(5, "Uncached Axe", 2, "INVTYPE_2HWEAPON", 33, 100, nil, 1)
    catalog[delayed].subtype = "Axes"
    local tool = item(6, "Artisan Needle", 20, "INVTYPE_PROFESSION_TOOL", 35, 1000)
    local dagger = item(7, "Dagger", 2, "INVTYPE_WEAPONMAINHAND", 30, 100)
    catalog[dagger].subtype = "Daggers"
    catalog[tool].subtype = "Tailoring"
    catalog[tool].stats = {ITEM_MOD_CRAFTING_SPEED_SHORT = 2, ITEM_MOD_MULTICRAFT_SHORT = 4}
    catalog[armor].stats.ITEM_MOD_MULTICRAFT_SHORT = 1
    ITEM_MOD_MULTICRAFT_SHORT = "Multicraft"
    catalog[delayed].pending = true
    local scan = {
      row(sword, 1, 150000), row(sword, 1, 120000), row(greatsword, 2, 199500, true),
      row(armor, 1, 5000), row(other, 1, 1), row(delayed, 1, 101), row(sword, 1, 0),
      row(tool, 1, 1000), row(dagger, 1, 100),
    }
    bus:Fire(source, "complete", scan)
    scan[2].replicateInfo[10] = 999999
    local primaryStats = {ITEM_MOD_AGILITY_SHORT = true, ITEM_MOD_STRENGTH_SHORT = true}
    local deals, _, missing, gear, stats = Module:FindDeals({
      gear = gearFilter(nil, {weapon = true}), stats = primaryStats, statMode = "any",
      minLevel = "30", maxLevel = "35", maxLoss = "0.20", query = "sword",
    })
    assert(missing == 1 and requested[5])
    assert(#deals == 2 and deals[1].link == greatsword and deals[1].quantity == 2)
    assert(deals[1].buyout == 199500 and deals[1].vendor == 200000 and deals[1].loss == -500)
    assert(deals[2].buyout == 120000 and deals[2].loss == 2000, "Use captured cheapest exact buyout")
    assert(gear.slots.INVTYPE_PROFESSION_TOOL and gear.types.Tailoring and gear.weapons.Swords)
    assert(stats.ITEM_MOD_MULTICRAFT_SHORT == "Multicraft" and stats.ITEM_MOD_CRAFTING_SPEED_SHORT,
      "Discover stats across the full snapshot, not only the current results")
    local filtered = assert(Module:FindDeals({
      gear = gearFilter(nil, {INVTYPE_2HWEAPON = true}), stats = primaryStats, statMode = "all", maxLoss = "0",
    }))
    assert(#filtered == 1 and filtered[1].link == greatsword)
    local strength = {ITEM_MOD_STRENGTH_SHORT = true}
    filtered = assert(Module:FindDeals({gear = gearFilter(), stats = strength, maxLevel = "32", maxLoss = "0"}))
    assert(#filtered == 1 and filtered[1].link == armor)
    local craftingStats = {ITEM_MOD_CRAFTING_SPEED_SHORT = true, ITEM_MOD_MULTICRAFT_SHORT = true}
    filtered = assert(Module:FindDeals({gear = gearFilter(), stats = craftingStats, statMode = "any"}))
    assert(#filtered == 2, "Match any should include both items that provide Multicraft")
    filtered = assert(Module:FindDeals({gear = gearFilter(), stats = craftingStats, statMode = "all"}))
    assert(#filtered == 1 and filtered[1].link == tool)
    filtered = assert(Module:FindDeals({gear = gearFilter(nil, nil, {Tailoring = true}), stats = {}}))
    assert(#filtered == 1 and filtered[1].link == tool, "Include equipment outside weapon and armor classes")
    assert(not Module:FindDeals({gear = gearFilter(), stats = {}, minLevel = "35", maxLevel = "30"}))
    assert(not Module:FindDeals({gear = gearFilter(), stats = {}, maxLoss = "-1"}))
    catalog[delayed].pending = false
    filtered = assert(Module:FindDeals({gear = gearFilter(nil, {weapon = true}), stats = strength, query = "uncached"}))
    assert(#filtered == 1 and filtered[1].link == delayed)

    namespace.Addon.commands.fffgear()
    local background = Module.window.frame.textures
    assert(background[1].opacity == 1 and background[1].shown, "The game world must not show through the window")
    assert(background[2].image and background[2].shown, "The opaque backing must have a visible texture over it")
    assert(Module.statDropdown.multiselect and Module.statDropdown.values.ITEM_MOD_MULTICRAFT_SHORT)
    local weapons, slots, types = Module.gearDropdowns.weapons, Module.gearDropdowns.slots, Module.gearDropdowns.types
    assert(weapons.multiselect and slots.multiselect and types.multiselect and types.values.Tailoring)
    assert(table.concat(weapons.order, ",") == "Axes,Daggers,Swords" and not weapons.values.Plate)
    weapons.callbacks.OnValueChanged(weapons, nil, "Axes", true)
    weapons.callbacks.OnValueChanged(weapons, nil, "Swords", true)
    click(Module.window, "Search")
    assert(#Module.results == 3 and weapons.checked.Axes and weapons.checked.Swords and weapons.text == "2 selected")
    assert(Module.results[1].link == greatsword and Module.results[2].link == delayed and Module.results[3].link == sword,
      "Match either selected weapon type, but exclude unselected types")
    slots.callbacks.OnValueChanged(slots, nil, "INVTYPE_CHEST", true)
    types.callbacks.OnValueChanged(types, nil, "Tailoring", true)
    click(Module.window, "Search")
    assert(#Module.results == 5, "Match any choice across weapon types, slots, and other gear types")
    Module.statDropdown.callbacks.OnValueChanged(nil, nil, "ITEM_MOD_MULTICRAFT_SHORT", true)
    click(Module.window, "Clear gear")
    assert(Module.clearGearButton.disabled and weapons.text == "None selected" and not next(weapons.checked))
    assert(#Module.results == 2, "Clearing gear selections must preserve the stats filter")

    weapons.callbacks.OnValueChanged(weapons, nil, "Axes", true)
    bus:Fire(source, "complete", {row(sword, 1, 120000)})
    assert(#Module.results == 0 and weapons.checked.Axes and weapons.values.Axes == "Axes (not in scan)")
    weapons.callbacks.OnValueChanged(weapons, nil, "Axes", false)
    weapons.callbacks.OnValueChanged(weapons, nil, "Axes", true)
    weapons.callbacks.OnClosed(weapons)
    assert(weapons.text == "Axes", "An unavailable selection can still be toggled")
    click(Module.window, "Clear gear")
    scan[2].replicateInfo[10] = 120000
    bus:Fire(source, "complete", scan)
    click(Module.window, "Search")
    assert(#Module.results == 2)
    Module.statDropdown.callbacks.OnValueChanged(nil, nil, "ITEM_MOD_MULTICRAFT_SHORT", false)
    Module.filters.query = "Quickblade"
    click(Module.window, "Search")
    local deal = Module.results[1]
    click(Module.list, "Add to list")
    Module:AddToCart(deal)
    assert(saved.char.cart[deal.key] == deal and next(saved.char.cart, deal.key) == nil)
    click(Module.window, "Shopping list")
    bus:Fire(source, "complete", {row(sword, 1, 200000)})
    assert(saved.char.cart[deal.key].buyout == 120000 and Module.results == nil)
    Module.enabled = false
    Module:OnDisable()
    assert(not Module.window and not namespace.Addon.commands.fffgear)
    assert(not background[1].shown and not background[2].shown, "Don't change other windows that reuse this frame")
    bus:Fire(source, "complete", {})
    assert(saved.char.snapshot.listings[deal.key].buyout == 200000, "Disabled module must not capture scans")
  `, "scan format, exact buyouts, gear filters and read-only shopping list");
  load(modulePath, '"FictiveFixesForever", namespace');
  execute(`
    Module:OnInitialize()
    Module:OnEnable()
    namespace.Addon.commands.fffgear()
    local background = Module.window.frame.textures
    assert(#background == 2 and background[1].shown and background[2].shown)
    click(Module.window, "Shopping list")
    assert(next(saved.char.cart), "Saved shopping list should be available on a fresh module instance")
    click(Module.list, "Remove")
    assert(next(saved.char.cart) == nil)
  `, "saved list reopening and removal");
  execute(`
    local source, bus = {}, Auctionator.EventBus
    bus:RegisterSource(source, "summary scan")
    saved.char.snapshot = nil
    Module.filters.maxLoss = "1"
    click(Module.window, "Gear results")
    click(Module.window, "Search")
    assert(Module.searchNote:find("Run an Auctionator full scan", 1, true))
    local function summary(itemID, level, suffix, price)
      return {
        itemKey = {itemID = itemID, itemLevel = level, itemSuffix = suffix, battlePetSpeciesID = 0},
        minPrice = price, totalQuantity = 27,
      }
    end
    bus:Fire(source, "full_incremental_scan_complete", {
      summary(1, 30, 0, 120000), summary(1, 35, 41, 118500),
      summary(1, 35, 52, 118600), summary(4, 0, 0, 1),
    })
    assert(saved.char.snapshot.summary and #Module.results == 3, "The default scan should populate the open window")
    local row = Module.results[1]
    assert(row.summary and row.baseItem and row.level == 35)
    assert(row.quantity == 1 and row.vendor == 118000 and row.loss == 500,
      "Use the per-item quote, not the total available quantity")
    local function findText(fragment)
      for _, child in ipairs(Module.list.children) do
        if child.text and child.text:find(fragment, 1, true) then return true end
      end
    end
    assert(findText("Summary scan: minimum price per item") and findText("Base vendor:"))
    assert(findText("Quickblade") and not findText("item:1"))
    local filters = {gear = gearFilter(), stats = {ITEM_MOD_AGILITY_SHORT = true}, minLevel = "35"}
    local rows = assert(Module:FindDeals(filters))
    assert(#rows == 0, "Do not use base stats for unresolved suffixes")

    catalog["item:1:variant"] = {
      id = 1, name = "Quickblade of Agility", subtype = "Swords", level = 35, vendor = 117000,
      stats = {ITEM_MOD_AGILITY_SHORT = 8},
    }
    C_TooltipInfo = {GetItemKey = function(id, level, suffix)
      if id == 1 and level == 35 and suffix == 52 then return {hyperlink = "item:1:variant"} end
    end}
    rows = assert(Module:FindDeals(filters))
    assert(#rows == 1 and rows[1].link == "item:1:variant" and rows[1].loss == 1600
      and not rows[1].baseItem, "Use a resolved variant's own stats and vendor value")
    click(Module.list, "Add to list")
    click(Module.window, "Shopping list")
    assert(findText("Min price:") and findText("Base vendor:"), "Saved estimates stay labeled")

    local snapshot = saved.char.snapshot
    bus:Fire(source, "prices_processed", {summary(1, 30, 0, 1)})
    assert(saved.char.snapshot == snapshot, "Ordinary browse processing does not replace the snapshot")
    Module.enabled = false
    Module:OnDisable()
    bus:Fire(source, "full_incremental_scan_complete", {summary(1, 30, 0, 1)})
    assert(saved.char.snapshot == snapshot, "Disabled module must not capture summary scans")
  `, "default incremental scan populates the open window with labeled per-item prices");
  console.log("PASS: Gear Deals scan formats, filters and pricing, shopping list, and no auction actions");
} finally {
  lua.lua_close(state);
}
