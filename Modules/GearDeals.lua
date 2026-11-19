local _, addonTable = ...
local Addon = addonTable.Addon
local Module = Addon:NewModule("GearDeals")
Module.displayName = "Gear Deals"
Module.description = "Browse the latest Auctionator full scan and save gear to a personal shopping list. Never buys or bids."

local AceGUI = LibStub("AceGUI-3.0")
local PAGE_SIZE = 6
local SLOTS = {
  weapon = "All weapons", armor = "All armor",
  INVTYPE_HEAD = "Head", INVTYPE_NECK = "Neck", INVTYPE_SHOULDER = "Shoulder",
  INVTYPE_CLOAK = "Back", INVTYPE_CHEST = "Chest", INVTYPE_WRIST = "Wrist",
  INVTYPE_HAND = "Hands", INVTYPE_WAIST = "Waist", INVTYPE_LEGS = "Legs",
  INVTYPE_FEET = "Feet", INVTYPE_FINGER = "Ring", INVTYPE_TRINKET = "Trinket",
  INVTYPE_2HWEAPON = "Two-handed weapon", INVTYPE_WEAPON = "One-handed weapon",
  INVTYPE_RANGED = "Ranged weapon", INVTYPE_SHIELD = "Shield", INVTYPE_HOLDABLE = "Held in off-hand",
}
local GEAR_MENUS = {
  {key = "weapons", label = "Weapon types"},
  {key = "slots", label = "Gear slots and groups"},
  {key = "types", label = "Other gear types"},
}
local function GearSelections()
  return {weapons = {}, slots = {}, types = {}}
end

local function HasGearFilter(gear)
  return next(gear.slots) ~= nil or next(gear.weapons) ~= nil or next(gear.types) ~= nil
end

local STAT_MODES = {any = "Any selected", all = "All selected"}
local function TokenLabel(key)
  local localized = _G[key]
  if type(localized) == "string" and localized ~= "" then
    return localized
  end
  local token = key:gsub("^ITEM_MOD_", ""):gsub("^INVTYPE_", ""):gsub("_SHORT$", "")
  return (token:lower():gsub("_", " "):gsub("%a+", function(word)
    return word:sub(1, 1):upper() .. word:sub(2)
  end))
end

local function Key(link, quantity)
  return link .. "\t" .. quantity
end

local function FormatMoney(value)
  local formatter = Auctionator and Auctionator.Utilities and Auctionator.Utilities.CreatePaddedMoneyString
  local amount = math.abs(value)
  local text = formatter and formatter(amount)
    or ("%dg %02ds %02dc"):format(math.floor(amount / 10000), math.floor(amount / 100) % 100, amount % 100)
  return value < 0 and ("-" .. text) or text
end

Module.options = {
  type = "group",
  name = "Window",
  args = {
    open = {
      type = "execute",
      name = "Open Gear Deals",
      func = function() Module:Open() end,
    },
  },
}

function Module:OnInitialize()
  self.db = Addon.db:RegisterNamespace("GearDeals", {char = {cart = {}}})
  self.filters = {gear = GearSelections(), stats = {}, statMode = "any"}
end

function Module:ConnectAuctionator()
  local bus = Auctionator and Auctionator.EventBus
  local events = Auctionator and Auctionator.FullScan and Auctionator.FullScan.Events
  local incremental = Auctionator and Auctionator.IncrementalScan and Auctionator.IncrementalScan.Events
  local fullEvent = events and events.ScanComplete
  local browseEvent = incremental and incremental.ScanComplete
  if bus and type(bus.Register) == "function" and type(bus.Unregister) == "function" and (fullEvent or browseEvent) then
    self.scanEvents = {fullEvent or browseEvent}
    if fullEvent and browseEvent and fullEvent ~= browseEvent then
      self.scanEvents[2] = browseEvent
    end
    self.scanBus, self.browseScanEvent = bus, browseEvent
    bus:Register(self, self.scanEvents)
    return true
  end
  return false
end

function Module:OnEnable()
  Addon:RegisterChatCommand("fffgear", function() self:Open() end)
  if not self:ConnectAuctionator() then
    self:RegisterEvent("ADDON_LOADED", "OnAddonLoaded")
  end
end

function Module:OnAddonLoaded(_, name)
  if name == "Auctionator" and self:ConnectAuctionator() then
    self:UnregisterEvent("ADDON_LOADED")
    self:RenderResults()
  end
end

function Module:OnDisable()
  Addon:UnregisterChatCommand("fffgear")
  if self.scanBus then
    self.scanBus:Unregister(self, self.scanEvents)
    self.scanBus, self.scanEvents, self.browseScanEvent = nil, nil, nil
  end
  if self.window then
    self.window:Hide()
  end
end

function Module:ReceiveEvent(event, scan)
  if not self.scanEvents or (event ~= self.scanEvents[1] and event ~= self.browseScanEvent) then
    return
  end
  if type(scan) ~= "table" then
    Addon:Print("Gear Deals did not receive listing data from the completed Auctionator scan.")
    return
  end

  local summary = event == self.browseScanEvent
  local listings, gear = {}, {}
  for _, row in pairs(scan) do
    local link = row.itemLink
    local reference, quantity, buyout, itemID, level, suffix, key
    if summary then
      local itemKey = row.itemKey
      if itemKey and type(itemKey.itemID) == "number" and itemKey.itemID > 0
          and (itemKey.battlePetSpeciesID or 0) == 0 then
        itemID, level, suffix = itemKey.itemID, itemKey.itemLevel or 0, itemKey.itemSuffix or 0
        reference, quantity, buyout = itemID, 1, row.minPrice
        key = ("browse:%d:%d:%d"):format(itemID, level, suffix)
      end
    else
      local info = row.replicateInfo or row.auctionInfo
      if info and type(link) == "string" then
        reference, quantity, buyout = link, info[3], info[10]
      end
    end
    if reference and type(quantity) == "number" and quantity >= 1
        and type(buyout) == "number" and buyout > 0 then
      if gear[reference] == nil then
        local _, _, _, slot, _, classID = C_Item.GetItemInfoInstant(reference)
        local class = classID == Enum.ItemClass.Weapon and "weapon"
          or classID == Enum.ItemClass.Armor and "armor" or "other"
        gear[reference] = slot and slot ~= "" and slot ~= "INVTYPE_NON_EQUIP"
          and slot ~= "INVTYPE_BAG" and slot ~= "INVTYPE_QUIVER"
          and {class = class, slot = slot} or false
      end
      local item = gear[reference]
      if item then
        key = key or Key(link, quantity)
        if not listings[key] or buyout < listings[key].buyout then
          listings[key] = {
            link = link, itemID = itemID, level = level, suffix = suffix,
            quantity = quantity, buyout = buyout, class = item.class,
            slot = item.slot,
          }
        end
      end
    end
  end

  self.db.char.snapshot = {time = time(), listings = listings, summary = summary}
  self.results, self.searchNote, self.gearChoices, self.statChoices = nil, nil, nil, nil
  if self.mode ~= "cart" then
    self.page = 1
  end
  if self.list and self.mode == "results" then
    self:Search()
  else
    self:RenderResults()
  end
end

local function HasStat(value)
  return type(value) == "number" and value ~= 0
end

local function MatchesStats(stats, selected, mode)
  if not next(selected) then return true end
  if not stats then return false end
  for key in pairs(selected) do
    local present = HasStat(stats[key])
    if mode == "all" and not present then return false end
    if mode ~= "all" and present then return true end
  end
  return mode == "all"
end

local function ReadLimit(text)
  if not text or not text:find("%S") then
    return nil
  end
  local value = tonumber(text)
  if not value or value < 0 or value == math.huge then
    return nil, true
  end
  return value
end

local function ReadItem(listing, getStats)
  local link = listing.link
  if listing.itemID and C_TooltipInfo and C_TooltipInfo.GetItemKey then
    local tooltip = C_TooltipInfo.GetItemKey(listing.itemID, listing.level, listing.suffix)
    if tooltip and tooltip.hyperlink and C_Item.GetItemInfoInstant(tooltip.hyperlink) == listing.itemID then
      link = tooltip.hyperlink
    end
  end
  local reference = link or listing.itemID
  local info = {C_Item.GetItemInfo(reference)}
  local baseLevel = info[1] and C_Item.GetDetailedItemLevelInfo(reference)
  local level = listing.level and listing.level > 0 and listing.level or baseLevel
  if not info[1] or not level or type(info[11]) ~= "number" then
    local itemID = listing.itemID or C_Item.GetItemInfoInstant(reference)
    if itemID then C_Item.RequestLoadItemDataByID(itemID) end
    return false
  end

  local isVendorable = Auctionator and Auctionator.Utilities and Auctionator.Utilities.IsVendorable
  -- A base item's stats may be wrong for an unresolved suffix or item level.
  local canReadStats = link or (listing.suffix == 0 and level == baseLevel)
  return {
    name = info[1], link = link or info[2] or ("item:" .. listing.itemID), level = level,
    subtype = info[7] or "", vendor = (not isVendorable or isVendorable(info)) and info[11] or 0,
    stats = getStats and canReadStats and getStats(link or info[2] or reference),
    baseItem = not link,
  }
end

function Module:FindDeals(filters)
  local minLevel, badMin = ReadLimit(filters.minLevel)
  local maxLevel, badMax = ReadLimit(filters.maxLevel)
  local maxLoss, badLoss = ReadLimit(filters.maxLoss)
  if badMin or badMax or (minLevel and minLevel % 1 ~= 0) or (maxLevel and maxLevel % 1 ~= 0) then
    return nil, "Item levels must be non-negative whole numbers."
  elseif minLevel and maxLevel and minLevel > maxLevel then
    return nil, "Minimum item level cannot exceed maximum item level."
  elseif badLoss then
    return nil, "Maximum loss must be a non-negative gold amount (e.g. 0.25 for 25s)."
  end
  local snapshot = self.db.char.snapshot
  if not snapshot then
    return nil, "Run an Auctionator full scan while Gear Deals is enabled."
  end

  local query = (filters.query or ""):match("^%s*(.-)%s*$"):lower()
  local lossLimit = maxLoss and math.floor(maxLoss * 10000 + 0.000001)
  local getStats = C_Item.GetItemStats or GetItemStats
  local selected = filters.stats
  if next(selected) and not getStats then
    return nil, "This client does not expose gear stats to addons."
  end
  local results, missing, metadata = {}, 0, {}
  local gearChoices, statChoices = GearSelections(), {}
  local gear = filters.gear
  local hasGearFilter = HasGearFilter(gear)
  for key, listing in pairs(snapshot.listings) do
    if SLOTS[listing.class] then
      gearChoices.slots[listing.class] = SLOTS[listing.class]
    end
    if not gearChoices.slots[listing.slot] then
      gearChoices.slots[listing.slot] = _G[listing.slot] or SLOTS[listing.slot] or TokenLabel(listing.slot)
    end
    local itemKey = listing.link or key
    local item = metadata[itemKey]
    if item == nil then
      item = ReadItem(listing, getStats)
      if item then
        for stat, value in pairs(item.stats or {}) do
          if type(stat) == "string" and HasStat(value) and not statChoices[stat] then
            statChoices[stat] = TokenLabel(stat)
          end
        end
      end
      metadata[itemKey] = item
    end
    local typeMenu = listing.class == "weapon" and "weapons" or "types"
    local subtype = item and item.subtype
    if subtype and subtype ~= "" then
      gearChoices[typeMenu][subtype] = subtype
    end
    if not hasGearFilter or gear.slots[listing.class] or gear.slots[listing.slot]
        or (subtype and gear[typeMenu][subtype]) then
      if not item or (next(selected) and not item.stats) then
        missing = missing + 1
      elseif item.vendor > 0 and MatchesStats(item.stats, selected, filters.statMode)
          and (not minLevel or item.level >= minLevel) and (not maxLevel or item.level <= maxLevel)
          and (query == "" or item.name:lower():find(query, 1, true) or item.subtype:lower():find(query, 1, true)) then
        local vendor = item.vendor * listing.quantity
        local loss = listing.buyout - vendor
        if not lossLimit or loss <= lossLimit then
          results[#results + 1] = {
            key = key, link = item.link, name = item.name, level = item.level,
            subtype = item.subtype, quantity = listing.quantity, buyout = listing.buyout,
            vendor = vendor, loss = loss, time = snapshot.time,
            summary = snapshot.summary, baseItem = item.baseItem,
          }
        end
      end
    elseif not item and next(gear[typeMenu]) then
      missing = missing + 1
    end
  end
  table.sort(results, function(a, b)
    if a.loss ~= b.loss then return a.loss < b.loss end
    if a.buyout ~= b.buyout then return a.buyout < b.buyout end
    return a.key < b.key
  end)
  return results, nil, missing, gearChoices, statChoices
end

function Module:Search()
  local results, message, missing, gearChoices, statChoices = self:FindDeals(self.filters)
  self.results, self.page = results, 1
  self.searchNote = message
  if results then
    self.gearChoices, self.statChoices = gearChoices, statChoices
  end
  if results and missing > 0 then
    self.searchNote = ("%d candidates lack item or variant stat data. Search again after it loads."):format(missing)
  end
  self:UpdateFilterMenus()
  self:RenderResults()
end

local function GearMenuText(dropdown, selection)
  local count, first = 0, nil
  for _, label in pairs(selection) do
    count, first = count + 1, label
  end
  dropdown:SetText(count == 0 and "None selected" or count == 1 and first or ("%d selected"):format(count))
end

function Module:UpdateFilterMenus()
  if not self.gearDropdowns then return end
  local gear = self.gearChoices or GearSelections()
  for _, menu in ipairs(GEAR_MENUS) do
    local dropdown = self.gearDropdowns[menu.key]
    local selected, choices, order, stale = self.filters.gear[menu.key], {}, {}, {}
    for key, label in pairs(gear[menu.key]) do choices[key] = label end
    for key, label in pairs(selected) do
      if not choices[key] then
        choices[key], stale[key] = label .. " (not in scan)", label
      end
    end
    for key in pairs(choices) do order[#order + 1] = key end
    table.sort(order, function(a, b)
      if choices[a] == choices[b] then return a < b end
      return choices[a] < choices[b]
    end)
    dropdown:SetList(choices, order)
    dropdown:SetUserData("staleGear", stale)
    for key in pairs(selected) do dropdown:SetItemValue(key, true) end
    GearMenuText(dropdown, selected)
    dropdown:SetDisabled(#order == 0)
  end
  self.clearGearButton:SetDisabled(not HasGearFilter(self.filters.gear))
  local stats = self.statChoices or {}
  for key in pairs(self.filters.stats) do
    if not stats[key] then stats[key] = TokenLabel(key) .. " (not in scan)" end
  end
  self.statDropdown:SetList(stats)
  for key in pairs(self.filters.stats) do self.statDropdown:SetItemValue(key, true) end
  if not next(self.filters.stats) then self.statDropdown:SetText("Any stats") end
  self.statDropdown:SetDisabled(not next(stats))
end

function Module:AddToCart(deal)
  local cart = self.db.char.cart
  if not cart[deal.key] then
    cart[deal.key] = deal
    self:RenderResults()
  end
end

function Module:RemoveFromCart(key)
  self.db.char.cart[key] = nil
  self:RenderResults()
end

local function Button(parent, label, width, callback)
  local button = AceGUI:Create("Button")
  button:SetText(label)
  button:SetWidth(width)
  button:SetCallback("OnClick", callback)
  parent:AddChild(button)
  return button
end

local function Label(parent, text)
  local label = AceGUI:Create("Label")
  label:SetText(text)
  label:SetFullWidth(true)
  parent:AddChild(label)
end

function Module:BuildWindow()
  local window = self.window
  self:HideItemTooltip()
  window:ReleaseChildren()
  self.gearDropdowns, self.clearGearButton, self.statDropdown = nil, nil, nil
  Button(window, "Gear results", 145, function()
    self.mode, self.page = "results", 1
    self:BuildWindow()
  end):SetDisabled(self.mode == "results")
  Button(window, "Shopping list", 145, function()
    self.mode, self.page = "cart", 1
    self:BuildWindow()
  end):SetDisabled(self.mode == "cart")
  Label(window, self.mode == "cart" and "Saved leads only. Buy manually in your auction addon."
    or "Browse captured auction prices; prices and availability may have changed.")

  if self.mode == "results" then
    local function Edit(key, label, width)
      local input = AceGUI:Create("EditBox")
      input:SetLabel(label)
      input:SetWidth(width)
      input:DisableButton(true)
      input:SetText(self.filters[key] or "")
      input:SetCallback("OnTextChanged", function(_, _, value) self.filters[key] = value end)
      input:SetCallback("OnEnterPressed", function() self:Search() end)
      window:AddChild(input)
    end
    local function Dropdown(key, label, values, width)
      local dropdown = AceGUI:Create("Dropdown")
      dropdown:SetLabel(label)
      dropdown:SetWidth(width)
      dropdown:SetList(values)
      dropdown:SetValue(self.filters[key])
      dropdown:SetCallback("OnValueChanged", function(_, _, value) self.filters[key] = value end)
      window:AddChild(dropdown)
      return dropdown
    end
    Edit("query", "Item name or type (e.g. sword)", 245)
    Edit("minLevel", "Min item level", 115)
    Edit("maxLevel", "Max item level", 115)
    Edit("maxLoss", "Max loss (gold)", 115)
    Label(window, "Blank ranges are unrestricted. Set max loss to 0 for break-even or profit.")
    self.gearDropdowns = {}
    for _, menu in ipairs(GEAR_MENUS) do
      local key = menu.key
      local dropdown = AceGUI:Create("Dropdown")
      dropdown:SetLabel(menu.label)
      dropdown:SetWidth(190)
      dropdown:SetMultiselect(true)
      dropdown:SetCallback("OnValueChanged", function(widget, _, choice, checked)
        local gear = self.filters.gear
        local choices = self.gearChoices and self.gearChoices[key]
        local label = (choices and choices[choice]) or widget:GetUserData("staleGear")[choice]
        gear[key][choice] = checked and label or nil
        self.clearGearButton:SetDisabled(not HasGearFilter(gear))
      end)
      dropdown:SetCallback("OnClosed", function(widget)
        GearMenuText(widget, self.filters.gear[key])
      end)
      self.gearDropdowns[key] = dropdown
      window:AddChild(dropdown)
    end
    self.clearGearButton = Button(window, "Clear gear", 115, function()
      self.filters.gear = GearSelections()
      self:Search()
    end)
    Label(window, "Check any number of gear options. Results can match any checked option; none means all gear.")
    local stats = AceGUI:Create("Dropdown")
    self.statDropdown = stats
    stats:SetLabel("Stats (select any number)")
    stats:SetWidth(200)
    stats:SetMultiselect(true)
    stats:SetCallback("OnValueChanged", function(_, _, key, checked)
      self.filters.stats[key] = checked and true or nil
    end)
    window:AddChild(stats)
    Dropdown("statMode", "Match stats", STAT_MODES, 135)
    Button(window, "Search", 110, function() self:Search() end)
  end

  local list = AceGUI:Create("SimpleGroup")
  list:SetFullWidth(true)
  list:SetLayout("Flow")
  window:AddChild(list)
  self.list = list
  if self.mode == "results" and self.db.char.snapshot and not self.results then
    self:Search()
  else
    self:UpdateFilterMenus()
    self:RenderResults()
  end
end

function Module:RenderResults()
  if not self.list then return end
  local list = self.list
  self:HideItemTooltip()
  list:ReleaseChildren()
  local cart = self.db.char.cart
  local entries
  if self.mode == "cart" then
    entries = {}
    for _, deal in pairs(cart) do entries[#entries + 1] = deal end
    table.sort(entries, function(a, b)
      return a.name == b.name and a.key < b.key or a.name < b.name
    end)
    if #entries == 0 then
      Label(list, "Your shopping list is empty. Add gear from the results.")
    end
  else
    local snapshot = self.db.char.snapshot
    if snapshot then
      Label(list, "Latest captured scan: " .. date("%Y-%m-%d %H:%M", snapshot.time))
      if snapshot.summary then
        Label(list, "Summary scan: minimum price per item, not an individual listing.")
      end
    end
    if self.searchNote then
      Label(list, self.searchNote)
    elseif not snapshot then
      Label(list, self.scanBus and "No snapshot yet. Run an Auctionator full scan."
        or "Enable a compatible Auctionator version to capture new full scans.")
    elseif not self.results then
      Label(list, "Click Search to filter the latest capture.")
    end
    entries = self.results or {}
    if self.results and #entries == 0 then
      Label(list, "No gear matches those filters.")
    end
  end

  if #entries == 0 then return end
  local pages = math.ceil(#entries / PAGE_SIZE)
  local page = math.min(self.page, pages)
  self.page = page
  for i = (page - 1) * PAGE_SIZE + 1, math.min(page * PAGE_SIZE, #entries) do
    local deal = entries[i]
    local name = AceGUI:Create("InteractiveLabel")
    name:SetRelativeWidth(0.75)
    local itemText = deal.link:find("|Hitem:", 1, true) and deal.link or deal.name
    name:SetText(itemText .. (deal.quantity > 1 and (" x" .. deal.quantity) or "")
      .. ("  [iLvl %d, %s]"):format(deal.level, deal.subtype))
    name:SetCallback("OnEnter", function(widget)
      self.tooltipOwner = widget.frame
      GameTooltip:SetOwner(widget.frame, "ANCHOR_CURSOR")
      GameTooltip:SetHyperlink(deal.link)
      GameTooltip:Show()
    end)
    name:SetCallback("OnLeave", function() self:HideItemTooltip() end)
    list:AddChild(name)
    if self.mode == "cart" then
      Button(list, "Remove", 118, function() self:RemoveFromCart(deal.key) end)
    else
      local button = Button(list, cart[deal.key] and "On list" or "Add to list", 118, function() self:AddToCart(deal) end)
      button:SetDisabled(cart[deal.key] ~= nil)
    end
    local captured = self.mode == "cart" and ("  |  Scan: " .. date("%m-%d %H:%M", deal.time)) or ""
    Label(list, (deal.summary and "Min price: " or "Buyout: ") .. FormatMoney(deal.buyout)
      .. (deal.baseItem and "  |  Base vendor: " or "  |  Vendor: ") .. FormatMoney(deal.vendor)
      .. "  |  Cost to use: " .. FormatMoney(deal.loss) .. captured)
  end
  Label(list, ("%d items  |  Page %d of %d"):format(#entries, page, pages))
  Button(list, "Previous", 110, function()
    self.page = page - 1
    self:RenderResults()
  end):SetDisabled(page == 1)
  Button(list, "Next", 110, function()
    self.page = page + 1
    self:RenderResults()
  end):SetDisabled(page == pages)
end

function Module:HideItemTooltip()
  if self.tooltipOwner and GameTooltip:GetOwner() == self.tooltipOwner then
    GameTooltip:Hide()
  end
  self.tooltipOwner = nil
end

local function ShowWindowBackground(frame)
  local background = frame.fffGearDealsBackground
  if not background then
    local base = frame:CreateTexture(nil, "BACKGROUND", nil, -2)
    base:SetPoint("TOPLEFT", 8, -8)
    base:SetPoint("BOTTOMRIGHT", -8, 8)
    base:SetColorTexture(0.055, 0.045, 0.04, 1)

    local texture = frame:CreateTexture(nil, "BACKGROUND", nil, -1)
    texture:SetAllPoints(base)
    texture:SetTexture("Interface\\FrameGeneral\\UI-Background-Rock")
    texture:SetHorizTile(true)
    texture:SetVertTile(true)
    texture:SetAlpha(0.28)
    background = {base, texture}
    frame.fffGearDealsBackground = background
  end
  for _, region in ipairs(background) do region:Show() end
end

function Module:Open()
  if not self:IsEnabled() then
    Addon:Print("Enable Gear Deals under /fff > Modules first.")
    return
  end
  if self.window then
    self.window:Show()
    return
  end
  local window = AceGUI:Create("Frame")
  ShowWindowBackground(window.frame)
  window:SetTitle("FictiveFixesForever - Gear Deals")
  window:SetLayout("Flow")
  window:SetWidth(755)
  window:SetHeight(625)
  window:SetCallback("OnClose", function(widget)
    self:HideItemTooltip()
    -- AceGUI can reuse this frame for an unrelated window.
    for _, region in ipairs(widget.frame.fffGearDealsBackground) do region:Hide() end
    self.window, self.list, self.gearDropdowns, self.clearGearButton, self.statDropdown = nil, nil, nil, nil, nil
    AceGUI:Release(widget)
  end)
  self.window = window
  self.mode, self.page = "results", 1
  self:BuildWindow()
end
