local addonName, addonTable = ...
local Addon = addonTable.Addon
local AceConfigDialog = LibStub("AceConfigDialog-3.0")

function Addon:InitializeOptions()
  local moduleOptions = {
    description = {
      type = "description",
      name = "Each feature is a separate module. No feature modules have been added yet.",
      order = 1,
      hidden = function()
        return next(self.modules) ~= nil
      end,
    },
  }

  for moduleName, module in self:IterateModules() do
    local name = moduleName
    moduleOptions["module_" .. name] = {
      type = "group",
      name = module.displayName or name,
      args = {
        enabled = {
          type = "toggle",
          name = "Enable",
          desc = module.description or ("Enable the " .. name .. " module."),
          order = 1,
          get = function()
            return self.db.profile.modules[name]
          end,
          set = function(_, value)
            self:SetFeatureEnabled(name, value)
          end,
        },
        settings = module.options,
      },
    }
  end

  self.options = {
    type = "group",
    name = addonName,
    args = {
      general = {
        type = "group",
        name = "General",
        order = 1,
        args = {
          description = {
            type = "description",
            name = "A personal collection of small fixes and useful features. Feature settings appear under Modules.",
            order = 1,
          },
        },
      },
      modules = {
        type = "group",
        name = "Modules",
        order = 2,
        args = moduleOptions,
      },
      profiles = LibStub("AceDBOptions-3.0"):GetOptionsTable(self.db),
    },
  }
  self.options.args.profiles.order = 3

  LibStub("AceConfig-3.0"):RegisterOptionsTable(addonName, self.options)
  self.settingsPanel, self.settingsCategoryID = AceConfigDialog:AddToBlizOptions(addonName, addonName)
end

function Addon:OpenSettings()
  Settings.OpenToCategory(self.settingsCategoryID)
end
