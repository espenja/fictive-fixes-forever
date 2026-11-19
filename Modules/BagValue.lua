local addonName, addonTable = ...
local Addon = addonTable.Addon
local Module = Addon:NewModule("BagValue")
Module.displayName = "Bag + bank value"
Module.description = "Show manually refreshed vendor and auction values for the current character's cached bags and personal bank."
Module.options = {
  type = "group",
  name = "Details",
  args = {
    description = {
      type = "description",
      name = "Requires Baganator, Syndicator, and Auctionator. Click Refresh above the bags to calculate; opening bags never recalculates. Uses the current character only, even when browsing an alt. Bank contents and auction prices are cached estimates. Guild/warband banks, equipped items, mail, auction fees, and deposits are excluded.",
    },
  },
}

function Module:OnEnable()
  self.hookedFrames = self.hookedFrames or setmetatable({}, {__mode = "k"})
  if not self:ConnectBagFrames() then
    self:RegisterEvent("ADDON_LOADED", "OnAddonLoaded")
    Addon:Print("Bag + bank value is inactive: Baganator with its skin API is required.")
  end
end

function Module:OnDisable()
  if self.panel then
    self.panel:Hide()
  end
end

function Module:OnAddonLoaded(_, name)
  if name == "Baganator" and self:ConnectBagFrames() then
    self:UnregisterEvent("ADDON_LOADED")
  end
end

function Module:ConnectBagFrames()
  local skins = Baganator and Baganator.API and Baganator.API.Skins
  if not skins or type(skins.GetAllFrames) ~= "function" or type(skins.RegisterListener) ~= "function" then
    return false
  end
  if not self.skinListenerInstalled then
    skins.RegisterListener(function(details)
      if self:IsEnabled() then
        self:WatchBagFrame(details)
      end
    end)
    self.skinListenerInstalled = true
  end
  for _, details in ipairs(skins.GetAllFrames()) do
    self:WatchBagFrame(details)
  end
  return true
end

function Module:WatchBagFrame(details)
  if details.regionType ~= "ButtonFrame" then
    return
  end
  local isBackpack = false
  for _, tag in ipairs(details.tags or {}) do
    isBackpack = isBackpack or tag == "backpack"
  end
  if not isBackpack then
    return
  end

  local frame = details.region
  if not self.hookedFrames[frame] then
    frame:HookScript("OnShow", function()
      if self:IsEnabled() then
        self:AttachPanel(frame)
      end
    end)
    frame:HookScript("OnHide", function()
      if self.panel and self.panel:GetParent() == frame then
        self.panel:Hide()
      end
    end)
    self.hookedFrames[frame] = true
    if frame.BagSlots then
      for _, event in ipairs({"OnShow", "OnHide", "OnSizeChanged"}) do
        frame.BagSlots:HookScript(event, function()
          if self.panel and self.panel:GetParent() == frame then
            self:PositionPanel()
          end
        end)
      end
    end
  end
  if frame:IsShown() then
    self:AttachPanel(frame)
  end
end

function Module:AttachPanel(parent)
  if not self.panel then
    self:CreatePanel()
  end
  self.panel:SetParent(parent)
  self.panel:SetFrameLevel(parent:GetFrameLevel() + 10)
  self:PositionPanel()
  self.panel:Show()
end

function Module:PositionPanel()
  local parent = self.panel:GetParent()
  local slots = parent.BagSlots
  local clearance = slots and slots:IsShown() and slots:GetHeight() or 0
  self.panel:ClearAllPoints()
  self.panel:SetPoint("BOTTOM", parent, "TOP", 0, clearance + 4)
end

function Module:UpdatePanelLayout()
  self.content:SetShown(not self.collapsed)
  self.refreshButton:SetShown(not self.collapsed)
  self.toggleButton:SetText(self.collapsed and "Expand" or "Collapse")
  if self.collapsed then
    self.panel:SetSize(360, 34)
  else
    self.panel:SetSize(460, math.max(230, 170 + self.statusText:GetStringHeight()))
  end
end

local function AddText(frame, font, x, y, width, justify)
  local text = frame:CreateFontString(nil, "OVERLAY", font)
  text:SetPoint("TOPLEFT", x, y)
  text:SetWidth(width)
  text:SetJustifyH(justify or "LEFT")
  return text
end

function Module:CreatePanel()
  local panel = CreateFrame("Frame", nil, UIParent, "BackdropTemplate")
  panel:SetSize(460, 230)
  panel:SetClampedToScreen(true)
  panel:SetBackdrop({
    bgFile = "Interface\\Tooltips\\UI-Tooltip-Background",
    edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border",
    tile = true, tileSize = 16, edgeSize = 16,
    insets = {left = 4, right = 4, top = 4, bottom = 4},
  })
  panel:SetBackdropColor(0.05, 0.05, 0.05, 0.95)

  local header = CreateFrame("Frame", nil, panel)
  header:SetHeight(34)
  header:SetPoint("BOTTOMLEFT")
  header:SetPoint("BOTTOMRIGHT")
  AddText(header, "GameFontNormal", 12, -12, 240):SetText("Bag + bank value")

  local content = CreateFrame("Frame", nil, panel)
  content:SetPoint("TOPLEFT")
  content:SetPoint("BOTTOMRIGHT", panel, "BOTTOMRIGHT", 0, 34)
  AddText(content, "GameFontNormalSmall", 202, -12, 114, "RIGHT"):SetText("Vendor")
  AddText(content, "GameFontNormalSmall", 324, -12, 124, "RIGHT"):SetText("Auction")

  self.rows = {}
  for index, key in ipairs({"both", "vendorOnly", "auctionOnly"}) do
    local y = -12 - index * 21
    self.rows[key] = {
      label = AddText(content, "GameFontHighlightSmall", 12, y, 188),
      vendor = AddText(content, "GameFontHighlightSmall", 202, y, 114, "RIGHT"),
      auction = AddText(content, "GameFontHighlightSmall", 324, y, 124, "RIGHT"),
    }
  end
  self.rows.both.label:SetText("Vendor + auction")
  self.rows.vendorOnly.label:SetText("Vendor only")
  self.rows.auctionOnly.label:SetText("Auction only")
  for _, row in pairs(self.rows) do
    row.vendor:SetText("--")
    row.auction:SetText("--")
  end
  AddText(content, "GameFontNormal", 12, -100, 188):SetText("Best known total")
  self.totalText = AddText(content, "GameFontHighlight", 202, -100, 246, "RIGHT")
  self.totalText:SetText("--")
  self.statusText = AddText(content, "GameFontHighlightSmall", 12, -124, 436)
  self.statusText:SetText("Current character's bags + personal bank.\nClick Refresh to calculate. Nothing updates automatically.")

  self.refreshButton = CreateFrame("Button", nil, header, "UIPanelButtonTemplate")
  self.refreshButton:SetSize(78, 22)
  self.refreshButton:SetPoint("TOPRIGHT", -96, -6)
  self.refreshButton:SetText("Refresh")
  self.refreshButton:SetScript("OnClick", function()
    self:Refresh()
  end)
  self.toggleButton = CreateFrame("Button", nil, header, "UIPanelButtonTemplate")
  self.toggleButton:SetSize(78, 22)
  self.toggleButton:SetPoint("TOPRIGHT", -10, -6)
  self.toggleButton:SetScript("OnClick", function()
    self.collapsed = not self.collapsed
    self:UpdatePanelLayout()
  end)
  self.panel = panel
  self.content = content
  self.collapsed = true
  self:UpdatePanelLayout()
end

function Module:CalculateValue()
  local api = Syndicator and Syndicator.API
  if not api or type(api.IsReady) ~= "function" or type(api.IsBagEventPending) ~= "function"
      or type(api.GetCurrentCharacter) ~= "function" or type(api.GetCharacter) ~= "function"
      or not Syndicator.Constants then
    return nil, "A compatible Syndicator installation is required."
  end
  if not api.IsReady() then
    return nil, "Syndicator inventory data is not ready."
  end
  if api.IsBagEventPending() then
    return nil, "Syndicator is updating inventory. Click Refresh again shortly."
  end
  if not Auctionator or not Auctionator.API or not Auctionator.API.v1
      or type(Auctionator.API.v1.GetAuctionPriceByItemLink) ~= "function"
      or not Auctionator.Utilities or type(Auctionator.Utilities.IsVendorable) ~= "function"
      or type(Auctionator.Utilities.IsBound) ~= "function"
      or type(Auctionator.Utilities.CreatePaddedMoneyString) ~= "function" then
    return nil, "A compatible Auctionator installation is required."
  end
  local character = api.GetCurrentCharacter()
  local data = character and api.GetCharacter(character)
  if not data or type(data.bags) ~= "table" then
    return nil, "No bag snapshot is available for the current character."
  end

  local result = {
    character = character,
    both = {count = 0, vendor = 0, auction = 0, unpriced = 0},
    vendorOnly = {count = 0, vendor = 0, auction = 0, unpriced = 0},
    auctionOnly = {count = 0, vendor = 0, auction = 0, unpriced = 0},
    best = 0, missingData = 0, missingBinding = 0,
  }
  local metadata = {}
  local function AddSlot(slot)
    if not slot.itemID then
      return true
    end
    local count = slot.itemCount
    if type(count) ~= "number" or count < 1 then
      return nil, "A cached item has no valid stack count. Let Syndicator update and try again."
    end
    local link = slot.itemLink
    if not link then
      result.missingData = result.missingData + count
      C_Item.RequestLoadItemDataByID(slot.itemID)
      return true
    end
    if metadata[link] == nil then
      local info = {C_Item.GetItemInfo(link)}
      if info[1] and type(info[11]) == "number" and type(info[14]) == "number" then
        metadata[link] = {info = info}
      else
        metadata[link] = false
        C_Item.RequestLoadItemDataByID(slot.itemID)
      end
    end
    local details = metadata[link]
    if not details then
      result.missingData = result.missingData + count
      return true
    end

    local staticallyBound = Auctionator.Utilities.IsBound(details.info)
    if slot.isBound == nil and not staticallyBound then
      result.missingBinding = result.missingBinding + count
      return true
    end
    local canAuction = not slot.isBound and not staticallyBound
    local canVendor = Auctionator.Utilities.IsVendorable(details.info)
    local key = canVendor and (canAuction and "both" or "vendorOnly") or (canAuction and "auctionOnly")
    if not key then
      return true
    end
    local row = result[key]
    row.count = row.count + count
    local vendor = canVendor and math.floor(details.info[11]) or 0
    local auction = 0
    if canAuction then
      if not details.priceChecked then
        details.auctionPrice = Auctionator.API.v1.GetAuctionPriceByItemLink(addonName, link)
        details.priceChecked = true
      end
      if type(details.auctionPrice) == "number" and details.auctionPrice > 0 then
        auction = math.floor(details.auctionPrice)
      else
        row.unpriced = row.unpriced + count
      end
    end
    row.vendor = row.vendor + vendor * count
    row.auction = row.auction + auction * count
    result.best = result.best + math.max(vendor, auction) * count
    return true
  end

  local function AddContainer(slots)
    if type(slots) ~= "table" then
      return nil, "An inventory container snapshot is incomplete. Visit the bank and Refresh again."
    end
    for _, slot in pairs(slots) do
      local ok, message = AddSlot(slot)
      if not ok then
        return nil, message
      end
    end
    return true
  end
  for _, bag in pairs(data.bags) do
    local ok, message = AddContainer(bag)
    if not ok then
      return nil, message
    end
  end
  local tabbed = Syndicator.Constants.CharacterBankTabsActive
  local bank = data.bank
  if tabbed then
    bank = data.bankTabs
  end
  result.bankCached = type(bank) == "table" and next(bank) ~= nil
  for _, container in pairs(bank or {}) do
    local slots = container
    if tabbed then
      slots = container.slots
    end
    local ok, message = AddContainer(slots)
    if not ok then
      return nil, message
    end
  end
  return result
end

function Module:Refresh()
  local result, message = self:CalculateValue()
  if not result then
    self.statusText:SetText("|cffff5555Refresh failed: " .. message .. "|r\nPrevious totals, if any, are unchanged.")
    self:UpdatePanelLayout()
    return
  end
  self.result = result
  local formatMoney = Auctionator.Utilities.CreatePaddedMoneyString
  local labels = {both = "Vendor + auction", vendorOnly = "Vendor only", auctionOnly = "Auction only"}
  for key, row in pairs(self.rows) do
    local values = result[key]
    row.label:SetText(labels[key] .. " (" .. values.count .. ")")
    row.vendor:SetText(key == "auctionOnly" and "--" or formatMoney(values.vendor))
    local auctionText = formatMoney(values.auction)
    if values.unpriced > 0 then
      auctionText = auctionText .. "*"
    end
    row.auction:SetText(key == "vendorOnly" and "--" or auctionText)
  end
  self.totalText:SetText(formatMoney(result.best))
  local notes = {
    result.character .. " | Refreshed " .. date("%H:%M:%S") .. " | Gross estimates.",
    result.bankCached and "Bank: cached snapshot; visit the bank to update it." or "Bank not cached: visit your bank, then Refresh.",
  }
  local unpriced = result.both.unpriced + result.auctionOnly.unpriced
  if unpriced > 0 then
    notes[#notes + 1] = "* No auction price for " .. unpriced .. " items; total uses known vendor values."
  end
  if result.missingData > 0 or result.missingBinding > 0 then
    notes[#notes + 1] = "Excluded: " .. result.missingData .. " items need item data, " .. result.missingBinding .. " need binding data. Refresh again after data loads or a bank visit."
  end
  self.statusText:SetText(table.concat(notes, "\n"))
  self:UpdatePanelLayout()
end
