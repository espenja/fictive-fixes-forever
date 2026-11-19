const fs = require("node:fs");
const path = require("node:path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require(process.argv[2] || "fengari");

const modulePath = path.resolve(__dirname, "..", "Modules", "CombatNotifications.lua");
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
    throw new Error(to_jsstring(lua.lua_tostring(state, -1)));
  }
}

try {
  execute(`
    UIParent, STANDARD_TEXT_FONT, framesCreated = {}, "Fonts\\\\FRIZQT__.TTF", 0
    local Addon = {}
    function Addon:NewModule()
      Module = {events = {}}
      function Module:RegisterEvent(event, method) self.events[event] = method end
      function Module:Enable() self:OnEnable() end
      function Module:Disable()
        self:OnDisable()
        self.events = {}
      end
      return Module
    end
    namespace = {Addon = Addon}
    function emit(event)
      local method = Module.events[event]
      if method then Module[method](Module, event) end
    end
    function CreateFrame(kind, name, parent)
      assert(kind == "Frame" and name == nil and parent == UIParent)
      framesCreated = framesCreated + 1
      local frame = {}
      function frame:SetSize(width, height) self.width, self.height = width, height end
      function frame:SetPoint(...) self.point = {...} end
      function frame:SetFrameStrata(strata) self.strata = strata end
      function frame:EnableMouse(enabled) self.mouseEnabled = enabled end
      function frame:Hide() self.shown = false end
      function frame:Show() self.shown = true end
      function frame:SetAlpha(alpha) self.alpha = alpha end
      function frame:CreateFontString()
        local text = {}
        function text:SetPoint() end
        function text:SetFont(font, size, flags) self.font, self.size, self.flags = font, size, flags end
        function text:SetText(value) self.value = value end
        function text:SetTextColor(red, green, blue) self.color = {red, green, blue} end
        return text
      end
      function frame:CreateAnimationGroup()
        local group = {animations = {}, scripts = {}, plays = 0}
        function group:CreateAnimation(animationType)
          local animation = {}
          function animation:SetOrder(order) self.order = order end
          function animation:SetOffset(x, y) self.x, self.y = x, y end
          function animation:SetDuration(duration) self.duration = duration end
          function animation:SetSmoothing(smoothing) self.smoothing = smoothing end
          function animation:SetFromAlpha(alpha) self.from = alpha end
          function animation:SetToAlpha(alpha) self.to = alpha end
          function animation:SetStartDelay(delay) self.delay = delay end
          self.animations[animationType] = animation
          return animation
        end
        function group:SetScript(event, callback) self.scripts[event] = callback end
        function group:Stop() self.playing = false end
        function group:Play()
          assert(not self.playing, "Previous animation must stop before replay")
          assert(frame.alpha == 1, "A new message must start fully visible")
          self.playing = true
          self.plays = self.plays + 1
        end
        return group
      end
      return frame
    end
  `, "mocks");
  execute(fs.readFileSync(modulePath, "utf8"), modulePath, true);
  execute(`
    Module:Enable()
    assert(not Module.frame.shown and Module.animation.plays == 0, "No synthetic combat transition on enable")
    emit("PLAYER_REGEN_DISABLED")
    assert(Module.text.value == "+Combat" and Module.frame.shown)
    assert(Module.text.color[1] > Module.text.color[2], "Entering combat should be red")
    local scroll = Module.animation.animations.Translation
    local fade = Module.animation.animations.Alpha
    assert(scroll.y < 0 and scroll.x == 0, "Text must scroll vertically downward")
    local anchor = Module.frame.point
    assert(anchor[2] == UIParent and anchor[3] == "CENTER" and anchor[5] + scroll.y > 0,
      "Text must stay above screen center throughout its downward travel")
    assert(fade.from == 1 and fade.to == 0, "Text must fade out")
    assert(scroll.order == fade.order, "Scroll and fade must run concurrently")
    assert(math.abs(scroll.duration - fade.delay - fade.duration) < 0.00001)
    assert(Module.frame.mouseEnabled == false, "Overlay must not intercept clicks")
    Module.frame.alpha = 0.15
    emit("PLAYER_REGEN_ENABLED")
    assert(Module.text.value == "-Combat" and Module.animation.plays == 2)
    assert(Module.text.color[2] > Module.text.color[1], "Leaving combat should be green")
    assert(Module.frame.alpha == 1 and framesCreated == 1, "Reuse and reset the display")
    Module.animation.scripts.OnFinished()
    assert(not Module.frame.shown, "Finished notifications must disappear")
    emit("PLAYER_REGEN_DISABLED")
    local plays = Module.animation.plays
    Module:Disable()
    assert(not Module.frame.shown and not Module.animation.playing, "Disable must stop and hide the notification")
    emit("PLAYER_REGEN_ENABLED")
    assert(Module.animation.plays == plays, "Disabled module must not react")
    Module:Enable()
    assert(not Module.frame.shown and framesCreated == 1, "Re-enable must reuse the hidden display")
    emit("PLAYER_REGEN_ENABLED")
    assert(Module.text.value == "-Combat" and Module.animation.plays == plays + 1)
  `, "combat notification behavior");
  console.log("PASS: combat entry/exit text, downward fade, rapid transitions, completion, and disable/re-enable cleanup");
} finally {
  lua.lua_close(state);
}
