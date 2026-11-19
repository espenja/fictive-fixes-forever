local _, addonTable = ...
local Addon = addonTable.Addon
local Module = Addon:NewModule("CombatNotifications")
Module.displayName = "Combat notifications"
Module.description = "Show downward-scrolling, fading +Combat and -Combat text when entering or leaving combat."

function Module:OnEnable()
  if not self.frame then
    self:CreateDisplay()
  end
  self:RegisterEvent("PLAYER_REGEN_DISABLED", "OnCombatEntered")
  self:RegisterEvent("PLAYER_REGEN_ENABLED", "OnCombatLeft")
end

function Module:OnDisable()
  self.animation:Stop()
  self.frame:Hide()
end

function Module:CreateDisplay()
  local frame = CreateFrame("Frame", nil, UIParent)
  frame:SetSize(300, 50)
  frame:SetPoint("CENTER", UIParent, "CENTER", 0, 140)
  frame:SetFrameStrata("HIGH")
  frame:EnableMouse(false)
  frame:Hide()

  local text = frame:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
  text:SetPoint("CENTER")
  text:SetFont(STANDARD_TEXT_FONT, 28, "OUTLINE")

  local animation = frame:CreateAnimationGroup()
  local scroll = animation:CreateAnimation("Translation")
  scroll:SetOrder(1)
  scroll:SetOffset(0, -110)
  scroll:SetDuration(3)
  scroll:SetSmoothing("OUT")

  local fade = animation:CreateAnimation("Alpha")
  fade:SetOrder(1)
  fade:SetFromAlpha(1)
  fade:SetToAlpha(0)
  fade:SetStartDelay(1.5)
  fade:SetDuration(1.5)

  animation:SetScript("OnFinished", function()
    frame:Hide()
  end)

  self.frame = frame
  self.text = text
  self.animation = animation
end

function Module:ShowNotification(message, red, green, blue)
  self.animation:Stop()
  self.frame:SetAlpha(1)
  self.text:SetText(message)
  self.text:SetTextColor(red, green, blue)
  self.frame:Show()
  self.animation:Play()
end

function Module:OnCombatEntered()
  self:ShowNotification("+Combat", 1, 0.2, 0.2)
end

function Module:OnCombatLeft()
  self:ShowNotification("-Combat", 0.2, 1, 0.2)
end
