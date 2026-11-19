FictiveFixesForever
==================

A personal collection of small fixes and useful features.
Interface versions match the local Baganator manifest used during setup.

Usage
-----
Enable FictiveFixesForever in the character-selection addon list, then log in
or reload the UI. Open Settings > AddOns > FictiveFixesForever, or use /fff
or /fictivefixesforever.

General, Modules, and Profiles are provided through AceConfig and AceGUI.
AceDB stores settings in FictiveFixesForeverDB. The Default profile is shared
initially; additional profiles can be managed from the Profiles tab.

Libraries are bundled: no other addon or separate Ace3 installation is required.
Individual features can integrate with other addons, as described below.
The bundled libraries were copied from the local Questie installation.
Their original license notices are retained alongside each library.

Tooltip price difference
------------------------
Enabled by default. Requires Auctionator, which adds the yellow Vendor/Auction
tooltip lines. This module securely hooks Auctionator without modifying it.
Enable Auctionator's Auction tooltip option to see the comparison.

An "Auction - vendor" line appears immediately after Auction, using Auctionator's
coin textures, padding, and stack-count suffix. It uses the exact prices passed
to Auctionator's tooltip functions, including its Shift/stack-price setting.
Positive differences are green with a plus sign; negative differences are red;
equal prices show a yellow zero. Values are gross, before auction cuts or
deposits, and use Auctionator's cached price rather than a live auction query.

For example, a 1s 40c auction price and a 6c vendor price produce +1s 34c per
item, or +24s 12c for a stack of 18. Unknown auction prices, missing vendor
prices, and items for which Auctionator suppresses its Auction line are skipped.

Disable it under /fff > Modules > Tooltip price difference. Changes take effect
the next time the tooltip is built. Without Auctionator, the rest of the addon
still works and the module reports that its integration is inactive.

Combat notifications
--------------------
Enabled by default. Entering combat shows red "+Combat" text; leaving combat
shows green "-Combat" text. The outlined text starts 140 UI units above screen
center and scrolls downward 110 UI units over 3 seconds, staying above center
throughout. It stays fully visible for 1.5 seconds, then fades out over the
remaining 1.5 seconds. It does not intercept clicks.
Rapid transitions replace the current message and restart the animation, rather
than stacking overlapping messages. Enabling the module does not emit a message
until the next combat transition.

Disable it under /fff > Modules > Combat notifications. Disabling immediately
hides the text and stops its animation. No other addon is required.

Bag + bank value
----------------
Enabled by default. Requires Baganator, Syndicator, and Auctionator.
A compact control bar attaches above the top center of the backpack window,
leaving room for Baganator's visible bag-slot attachment. It follows bag
layout/skin changes and attachment visibility/height changes. It starts
collapsed; click Expand to show the values above the control bar, or Collapse
to hide them. The choice and any calculated results survive closing/reopening
bags during the current UI session. Expanding never triggers a calculation.
It always values the currently logged-in character, even when Baganator is
showing another character's inventory.

Expand the panel and click Refresh to read Syndicator's cached bags and personal
bank. Values use Auctionator's coin formatter for compatibility with this
client. Opening bags,
inventory changes, bank visits, and auction scans never recalculate the totals.
The last result remains until Refresh is clicked again (or the UI is reloaded).

Rows separate items sellable to both vendors and auction buyers, vendor-only
items (including soulbound equipment), and auction-only items with no vendor
value. Counts are individual items, not occupied slots. Auction eligibility
uses each cached stack's bound flag plus Auctionator's static binding checks.
Each row shows vendor/auction totals for that category. "Best known total"
chooses the higher known price for each stack and adds vendor-only value,
without double-counting or assuming that auctioning always beats vendoring.

Auction prices are Auctionator's cached per-link estimates, before fees and
deposits, and are not guaranteed sales. Unknown auction prices are marked with
an asterisk and counted in the notes; known vendor value is retained. Missing
item or binding data is explicitly excluded and reported. Refresh can request
missing item data, but does not automatically retry; click again after it loads.

Bank contents are the last Syndicator snapshot, available while away from the
bank. Visit the bank to update that snapshot, then click Refresh. A missing
bank snapshot is reported rather than silently presented as a complete total.
Both newer personal bank tabs and older bank bags are supported; they are not
counted together. Equipped bags, equipped gear, mail, auctions already posted,
guild banks, warband/account banks, and other characters are excluded.
Disable the panel under /fff > Modules > Bag + bank value.

Gear Deals
----------
After /reload, run an Auctionator full scan with Gear Deals enabled, then
type /fffgear or open it under /fff > Modules > Gear Deals. The latest full
scan is saved per character; opening Gear Deals never runs a scan. Both the
default summary scan and listing scans are supported. If a scan completed
before Gear Deals could capture it, run another one; older price history
cannot reconstruct its results.

Gear Deals uses an opaque, textured background for readability.

Search by name, item-level range, gear type, and maximum loss in gold
(0.25 = 25s). Check multiple options under Weapon types, Gear slots and
groups, or Other gear types. For example, check Axes and Swords to see
either type. Gear matches any checked option across the three menus, then
must pass the other filters. Clear gear removes these selections without
resetting the other filters.

The available gear options and stats come from the scan. Select multiple
stats and choose whether gear must have any or all of them. Stats that the
client does not expose as item stats (such as some tooltip effects) cannot
be filtered.
The level fields filter the gear's item level, not the character level needed
to equip it. Missing item data is requested; click Search again once it loads.
Results are ordered by auction price minus vendor sell value, lowest first.
Listing scans show total buyouts and vendor values for the whole listing,
keeping the cheapest buyout for each exact item link and quantity.
Summary scans show a minimum per-item price, not a specific listing. If a
variant cannot be resolved, its vendor estimate is labeled "Base vendor";
base stats are not used to filter an unresolved suffix or item-level variant.

Use Add to list to save leads and Shopping list to review or remove them.
The list persists per character across reloads and scans. A saved lead keeps
its original prices and scan time; always verify the current listing before
shopping. Purchases happen manually in another addon: Gear Deals does not
send auction searches, place bids, buy items, or push items to other addons.

Adding a feature
----------------
Create one Lua file per feature under Modules and add a Script entry for it to
Modules\Modules.xml. Paths in that XML file are relative to the Modules folder.
Module files load before AceAddon initialization; create modules at file scope.
Use a unique, stable name for each module.

Example module structure (not loaded or installed as a feature):

  local _, addonTable = ...
  local Addon = addonTable.Addon
  local Module = Addon:NewModule("Example")
  Module.displayName = "Example feature"
  Module.description = "Describe what this feature does."

  function Module:OnInitialize()
    self.db = Addon.db:RegisterNamespace("Example", {
      profile = {
        -- Feature-specific defaults go here.
      },
    })
  end

  function Module:OnEnable()
    -- Register events or apply the feature here.
  end

  function Module:OnDisable()
    -- Undo the feature's effects, cancel timers, and clean up owned UI here.
    -- AceEvent automatically unregisters events when the module is disabled.
  end

Modules receive AceEvent and AceTimer methods automatically. The core controls
their enabled state using the active profile; do not enable a module manually
from OnInitialize. Feature modules should implement reversible OnEnable and
OnDisable behavior, including combat-safe handling of protected UI.

Optionally assign an AceConfig group table to Module.options at file scope.
It appears below the module's Enable toggle. Option callbacks should access
Module.db.profile dynamically so that switching profiles uses current values.
Handle profile changes/copies/resets in a module when its live behavior needs
to be refreshed beyond simply enabling or disabling it.

Manual validation
-----------------
1. Enable Lua error reporting with /console scriptErrors 1, then /reload.
2. With only this addon and Auctionator enabled, verify there are no Lua errors.
3. Use /fff and the full slash command; both should open its Settings category.
4. Verify General, Modules > Tooltip price difference, and Profiles are displayed.
5. Create or switch profiles, reload, and confirm the selected profile persists.
6. Hover an item with known vendor and auction prices. Verify the difference is
   directly below Auction and matches subtraction of the two displayed values.
7. Hold/release Shift over a stack. All three prices should switch units together.
8. Check an item with no auction data, plus a bound or unvendorable item: no
   misleading difference should appear.
9. Toggle the module and switch/copy/reset profiles. Re-hover the item to verify
   that the module follows the saved enabled state without duplicate lines.
10. Disable Auctionator and reload: the addon should still load without errors.
11. Enter and leave combat: verify red "+Combat" and green "-Combat" each scroll
    downward and fade away. Quick transitions should restart cleanly.
12. Disable Combat notifications while its text is visible: it should disappear
    immediately and stay inactive until re-enabled.
13. Enable Baganator, Syndicator, and Auctionator, and open bags. The compact bar
    should appear above them without calculating anything. Expand, then Refresh.
14. Check stack counts and arithmetic with one unbound item and one soulbound
    vendorable item. The latter must contribute only to the vendor-only row.
15. Visit the bank once, close it, and Refresh while away. Cached personal bank
    items should be included. Opening/closing bags or looting must not refresh.
16. Move the bags, switch bag layouts/skins, and toggle this module: the panel
    should follow the active backpack and disappear when hidden/disabled.
17. Show/hide Baganator's attached bag slots: the bar should leave room for them.
    Collapse/expand and reopen bags: results should remain without recalculation.

Settings rendering and client-specific behavior require verification in WoW.

Automated validation
--------------------
With Node.js, the local Auctionator addon, and an existing Fengari installation:
  node Tests\TooltipPriceDifference.test.cjs <path-to-installed-fengari-package>
  node Tests\CombatNotifications.test.cjs <path-to-installed-fengari-package>
  node Tests\BagValue.test.cjs <path-to-installed-fengari-package>
  node Tests\GearDeals.test.cjs <path-to-installed-fengari-package>
The package path can be omitted if Node can resolve "fengari" directly.
Tooltip tests execute Auctionator's actual tooltip functions and money/count
formatters. Combat tests check event-driven messages, animation setup/restarts,
and cleanup. Bag value tests cover cached inventories, binding classification,
stack totals, partial prices, manual-only refresh, and panel lifecycle.
These tests use mocked WoW APIs. Fengari uses Lua 5.3, so these checks do
not replace testing in WoW's Lua runtime.
