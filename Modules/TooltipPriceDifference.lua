local _, addonTable = ...
local Addon = addonTable.Addon
local Module = Addon:NewModule("TooltipPriceDifference")
Module.displayName = "Tooltip price difference"
Module.description = "Show the auction price minus the vendor price below Auctionator's Auction line."
Module.options = {
  type = "group",
  name = "Details",
  args = {
    description = {
      type = "description",
      name = "Requires Auctionator and its Auction tooltip option. Uses the same prices and stack size as Auctionator. Green means auctioning pays more; red means vendoring pays more. Auction cuts, deposits, and the chance of selling are not included.",
    },
  },
}

function Module:OnEnable()
  self.vendorPrices = setmetatable({}, {__mode = "k"})
  if not self:HookAuctionator() then
    self:RegisterEvent("ADDON_LOADED", "OnAddonLoaded")
    if not Auctionator then
      Addon:Print("Tooltip price difference is inactive: enable Auctionator to use it.")
    end
  end
end

function Module:OnDisable()
  wipe(self.vendorPrices)
end

function Module:OnAddonLoaded(_, name)
  if name == "Auctionator" and self:HookAuctionator() then
    self:UnregisterEvent("ADDON_LOADED")
  end
end

function Module:HookAuctionator()
  if self.hooked then
    return true
  end
  if not Auctionator then
    return false
  end

  local tooltip = Auctionator.Tooltip
  if not tooltip or type(tooltip.AddVendorTip) ~= "function"
      or type(tooltip.AddAuctionTip) ~= "function"
      or not Auctionator.Utilities
      or type(Auctionator.Utilities.CreatePaddedMoneyString) ~= "function" then
    Addon:Print("Tooltip price difference is inactive: this Auctionator version is not supported.")
    return false
  end

  -- Auctionator passes already-scaled vendor and auction prices in consecutive calls.
  hooksecurefunc(tooltip, "AddVendorTip", function(frame, price, countString)
    if self:IsEnabled() then
      self.vendorPrices[frame] = {price = price, countString = countString}
    end
  end)
  hooksecurefunc(tooltip, "AddAuctionTip", function(...)
    self:OnAuctionTip(...)
  end)
  self.hooked = true
  return true
end

function Module:OnAuctionTip(tooltip, auctionPrice, countString, cannotAuction)
  local vendor = self.vendorPrices[tooltip]
  self.vendorPrices[tooltip] = nil
  if not self:IsEnabled() or cannotAuction or not vendor
      or vendor.countString ~= countString
      or type(vendor.price) ~= "number" or vendor.price <= 0
      or type(auctionPrice) ~= "number" or auctionPrice < 0 then
    return
  end
  if not Auctionator.Config.Get(Auctionator.Config.Options.AUCTION_TOOLTIPS) then
    return
  end

  local difference = math.floor(auctionPrice) - math.floor(vendor.price)
  local color, sign = "|cffffff00", ""
  if difference > 0 then
    color, sign = "|cff00ff00", "+"
  elseif difference < 0 then
    color, sign = "|cffff0000", "-"
  end

  tooltip:AddDoubleLine(
    "Auction - vendor" .. countString,
    color .. sign .. Auctionator.Utilities.CreatePaddedMoneyString(math.abs(difference)) .. "|r"
  )
end
