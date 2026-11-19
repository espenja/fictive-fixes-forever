local addonName, addonTable = ...
local Addon = LibStub("AceAddon-3.0"):NewAddon(addonName, "AceConsole-3.0", "AceEvent-3.0")
addonTable.Addon = Addon

Addon:SetDefaultModuleLibraries("AceEvent-3.0", "AceTimer-3.0")
Addon:SetDefaultModuleState(false)

local defaults = {
  profile = {
    modules = {
      ["*"] = true,
    },
  },
}

function Addon:OnInitialize()
  self.db = LibStub("AceDB-3.0"):New("FictiveFixesForeverDB", defaults, true)
  self.db.RegisterCallback(self, "OnProfileChanged", "ApplyModuleStates")
  self.db.RegisterCallback(self, "OnProfileCopied", "ApplyModuleStates")
  self.db.RegisterCallback(self, "OnProfileReset", "ApplyModuleStates")

  self:ApplyModuleStates()
  self:InitializeOptions()
  self:RegisterChatCommand("fff", "OpenSettings")
  self:RegisterChatCommand("fictivefixesforever", "OpenSettings")
end

function Addon:ApplyModuleStates()
  for name, module in self:IterateModules() do
    local enabled = self.db.profile.modules[name]
    if not self:IsEnabled() then
      module:SetEnabledState(enabled)
    elseif enabled then
      self:EnableModule(name)
    else
      self:DisableModule(name)
    end
  end
end

function Addon:SetFeatureEnabled(name, enabled)
  self:GetModule(name)
  self.db.profile.modules[name] = enabled
  self:ApplyModuleStates()
end
