feature that allows me to force clients to hard refresh on load
new crate, nav away, nav back, no new items list
lightbox fabric separate
bookmark feature??? for quickly returning to things? or "Open Windows" sidebar?

!!! Caching priority queue or allow nonessential processes to pause, and/or ensure that we don't use all threads at once
!!! rebuild date matching logic from scratch
!!! rebuild name matching logic from scratch
!!! simplify controls on reports page
! "views" for tables and reports allowing colum customization

- dims at the beginning of item descriptions for all items
- add and configure default crate types, ben often goes back and changes multiple times! un-alert items??? un-listed items?

## Important Deployment Notes

- Allow and request email feedback from users
- Bundle changes into updates, carefully log changes made, and send out a release email before making the updates
- Make sure any changes to user data or database structure are backwards compatible or allow users to migrate on first use

## Important System Notes

- whenever possible, rely on the caching system instead of data from live tables.
- Google drive rate-limits queries, making it difficult to realtime-check tons of stuff -> this impacts the ability to open multiple tabs at once
- We must always query the inventory by date for analytics, but we must never pass the date into a reactiveStore save or load call. This causes auto-save mismatch, etc.

## Feature ideas

Primary Use Cases

- [x] We can have pack lists generated from Inventor
- [x] We can know if there are item shortages as pack lists are generated
- [x] If we add bematrix stuff to pack lists, we can also check inventory qty of them
- [ ] If we auto generate packlists from concept models, we can get an early alert of possible inventory issues as those shows are approved (needs approval system)
- [x] We can get an inventory report of item quantities throughout the year
- [x] All of our data is available and easy to update on the go
      We can migrate all our checklists and schedule management to this system

Packlist improvements conversations

- Nomenclature (!!!TALK ABOUT THIS SOON!!!)
  TTOP/TBASE/TV/AV numbering
  SHLF vs SHELF, CNTR vs COUNTER, CAB vs CABINET, etc
- Copy paste? (!!!TALK ABOUT THIS SOON!!!)
- automation rules (MAYBE NOT RIGHT NOW... per conversation w ben)
  Rules: Typical Client Items, Tools and Supplies, Tech Accessories
  auto add new rows at end of packlist (client items, tools, etc)
  add a row following an item for typical inclusions (carpet + pad, monitor + cabling, etc)
- Crating from Ben:
  coffin crate 10' pile in, (sometimes furniture?)
  some things have designated crates, some more than one config of crate and are split out on occasion, or split out when less than crate is sent
  often if sending one, we will send on a skid
- doubles, As and Bs, and variant tracking
  should we keep them as separate items knowing they won't inventory check? Or should we consolidate them and just track overall quantity?
  A variant tracking system would allow for better tracking (NOT NOW per conversation w ben)
  (electronics with serial numbers, passwords, locations)
- Inventory Handling:
  Standard: FURNITURE, CABINETS, HANGING SIGNS, COUNTERTOPS, SHELVES, LIGHTBOXES, LIGHTING
  Special logic to support finding items: HARDWARE
  !!! In standard descriptions: Power strips? Cables? Keyboards and mice? Remotes? Antennas?
  Consolidated tracked: BEAMATRIX PANELS & HARDWARE
  (?) Extra tracking: ELECTRONICS, MONITORS
  (?) Monitor arms? Remotes and power strips?
  Will come in uninventoried: Client or new items shown in booth, Decorative Items

Other Features

- show what pdfs are exported for each project or on workzone
- Add "Advanced Views" that allows custom columns, column styling based on rules, etc? Should this be hardcoded?

## TO DO

**chores**

- [ ] unify the styling of cards and buttons
- [ ] change style system so that color variables are set via classes on components, and those variables set the "--color-\*" variables per component instead of globally.
- [x] make table headers accessible when scrolling, on hover over the sticky header?
- [ ] reports column headers percentage based and dynamically abbreviate
- [ ] basic schedule table needs to have return and show date columns visible
- [ ] basic schedule table needs to allow wide table
- [ ] test no internet mode
- [x] packlist interface somehow show "was previously" during edits
- [x] Inject the sheet ids and the api-key via github soas not to expose them
- [x] remove hamburger buttons that do nothing
- [x] packlist print titleblock??
- [x] add context variables to live site github
- [x] refresh buttons should clear caches
- [x] fix packlist table header alignment
- [x] simplify and impliment more url filling and parameter saving in nav and back buttons (for instance breadcrumb nav should cache some url params)
- [x] tableComponent finder needs: a clear all button
      clickable and highlightable (can copy contents) table cells instead of cell buttons
      allow modals to receive the arrow keys and enter button

**problems**

- [x] make external clicks clear checkboxes
- [x] icons still don't show for dan
- [?] for some reason, changes still arent loading into inventory when I leave and go back... my unsaved changes go away
- [x] Inv Reports table: item#, startdate, enddate, minqty, overlapping shows with that item
- [x] reverse packlist pin/unpin view, and add the "show pinned packlists" tooltip to the item
- [x] remove drag into bottom to delete.
- [x] collapsed groups mess up drop targets
- [x] don't highlight fields in basic tables...
- [x] add tooltip "3 rows copied..."
- [x] garbage can icon for deletion
- [x] fix thumbnail access
- [x] add additions inventory table
- [x] packlist inventory overlap alerts showing wrong info. Probably due to reformatted abstraction code.
- [x] canceled due to newer identical call shouldn't cancel but should pass the promise around to avoid failed analysis
- [x] navigation is not clearing prompt variable when the user selects logout or clicks out of the modal
- [x] make navigation auth modal logout on cancel
- [?] error causing unsyncing of packlist saves, especially when data or rows are deleted
- [x] clicking primary nav in desktop view should always nav to base page instead of doing so only every other click
- [x] buttons dont work on reports
- [x] changing url doesnt immidiately update saved search
- [x] container path update in packlistTable accidentally redirects the dashboard to the path as well. Fix this by making the edit endpoint not be a path location, but be a table mode instead.
- [x] error causing early dashboard changes to be overwritten by an empty dashboard
- [x] error causing card component to lose analytics details on reload after cache clear???
- [x] ensure log out/in does not break things: the pin button currently breaks on reauth (was test data missing email on reauth...)
- [x] error causing logout to not clean up all data and cause errors on reauth (username set to "User" instead of actual username)
- [x] New or empty packlists have the wrong headers: fix hardcoded templating and row showing errors
- [x] scrolling issue when navigating
- [t] error causing imperfect or corrupted analytics information on data refresh after auth
- [x] github deployment needs to be rerun every time due to config.js build issues? (need to set up deployment via actions in github settings)
- [x] waiting too long before reauthentication breaks requests and components get locked up in loading state with incorrect or empty reactiveStore data
- [x] adding an item within a group needs to add the item to the group
- [x] items currently can't be rearranged if they are grouped
- [?] some group dragging breaks the group
- [x] make the calls to user data automatically cancel and show a screen alert if the user hasnt given permissions.
- [?] dan ran into issue where at slow speeds, the inventory categories didn't load and never refreshed
- [?] error occurred 11:00 updating cache datestamp?
- [x] nonexistant packlists throw no access error when viewed, and fail to save. They should be savable from this view, or throw a 404 error.
- [x] date columns are not always presenting as dates, especially the ship date, in searches
- [x] if there are duplicate shows on the production schedule, they are duplicated in reports
- [x] packlist item shortage alerts are still broken
- [?] thumbnails not showing for dan
- [?] inventory table first edits are not shown as table-dirty after first nav away and back. Same for second/third edits if all done in quick sequence. Probably lock and flicker-prevention related.
- [x] fix thumbnails again: Consider a thumbnail table? make the analysis step invalidation ignore repeat invalidations: analysis invalidation reruns need to have a delay timer built in that gets pushed out, and cancelled if main data invalidates, and don't listen for analysis invalidation during main data load
- [x] fix thumbnails again: need reliable thumbnail cache table, thumbnails fail to load in rare cases if reauth while component unmounted? We need image urls to load reliably as an early step and not flicker into view.
- [x] advanced schedule search needs to allow date picker to override dropdown, and dropdown auto-change if date changes
- [x] !!! Allow pasting even if only a single column of data is copied
- [x] !!! ui for paste
- [ ] !!! I have not tested what happens if two users simultaniously trigger resolution
- [ ] when exporting from concept, does it use curent assembly, or separately find control????? if control model exists, ask if use that
- [ ] autosave backup is currently broken, probably because of failure to identify user tab or backup entries correctly
- [ ] packlist print from dashboard will not print correctly if not on packlist page first
- [ ] redundancy and overcomplexity in navigation still must be reduced
- [ ] the functions that manage schedule indexing need to be reworked for simplicity and brought in line with caching mechanisms...
- [ ] there is a ton of duplicated logic in production-utils that needs to be simplified or removed

**Application tasks**

HIGH PRIORITY: Export Basic Pack List from Inventor

- [x] Create new pack list in Google Sheets
- [x] Input items into Google Sheets
- [x] Open existing pack list and cross-reference before adding new parts, only adding parts that are not already present
- [x] make sure panel and hardware part numbers come in correctly
- [x] when consolidating HARDWARE if the vendor literally is "HARDWARE" don't set the part number to that
- [?] !!! fix oauth token refresh so no errors are hidden, and refresh is automatic
- [?] !!! Map STANDARD PARTS folder locations to the spreadsheet, possibly adding new column to the google index page for this
- [?] !!! Use folder->category mapping to determine transformation necessary
- [x] !!! Add support to automatically group items
- [x] !!! allow pack list export from project manager
- [?] ! fix system that checks for diff and allows updates to existing packlist instead of full overwrite
- [?] ! allow item metadata history and change source updating from inventor, and ensure inventor doesn't auto-update an in-app change without confirmation
- [?] !!! need the packlist export to ensure that the abbreviations are correct linking to a show if no show found
- [?] !!! fix CABINET item numbers in inventor
- [ ] !!! fix FURNITURE item numbers in inventor
- [?] !!! fix HANGING SIGN item numbers in inventor
- [ ] !!! fix duplication of bematrix VELCRO PANELS
- [ ] !!! fix 45 degree curved panels
- [ ] !!! verify panel and hardware and other possible edge-cases
- [ ] show notifications if the packlist was in-app changed to not match the current model for inventoried items
      automatically add thumbnails for uninventoried items?

inventory updates

- [x] include all current categories
- [x] Improve inventory item finding: match actual bematrix hardware to inventory bematrix item numbers
- [x] allow editing of item quantities
- [x] allow editing of item descriptions
- [x] allow adding new items
- [x] add existing item thumbnails
- [x] make thumbnails be a cached analytics step
- [x] force all inventory changes to have a "change date" that is separate from the edit history date, and update the table to show future changes (force reference date input) in additional rows following the main item row
- [x] force projects to query the inventory by date
- [x] allow uploading new item thumbnails
- [x] optimize thumbnails: app data sheet needs to have a table of thumbnail locations that is loaded and checked before calling the function that gets thumbnail folder contents
- [x] optimize thumbnails: invalidate this cache only when new thumbnails are added, or a thumbnail change occurrs
- [x] update LIGHTBOXES
- [?] ensure inventory table generation is unified so changes propegate throughout components and reports correctly
- [ ] ! add all FURNITURE
- [ ] ! add all LIGHTING
- [ ] track crate information to further streamline pack list generation (Crate UI similar to packlists? Allow Ben to manage crates, and analysis search/suggest typical crates when editing a packlist?)
- [ ] allow attaching a change dates to a project??? for instance, if we are selling a chair to a client, or if a chair broke at a show, or we are aquiring a chair for a show
- [ ] create a history modification utility for viewing changes over time and changing their values if necessary
      allow assigning and tracking items with unique ids. ex: cradlepoint routers with individual serial numbers, passwords, and location info attached in inventory and tracked separately
      item status interface to locate items and update item status
      We could integrate a repair schedule and other things into this system for a complete inventory management system

Architecture Improvements !!! offline mode

- [x] dashboard configuration
- [x] user preferences storage
- [x] ReactiveStore periodically save data to spreadsheet, and check + load data from spreadsheet to prevent data loss on accidental tab close or crash. Notify user "recovered unsaved changes..."
- [x] extra spreadsheet EditHistory column
- [x] save history: dateTime, userName, fields edited & old values
- [x] reactiveStore efficiency: stack, prioritize, and batch api calls from reactiveStores to ensure application data is available first without hitting rate limits
- [x] log out needs to skip database operations if the token is already expired
- [x] locking and edit rules to prevent simultaneous edits: 'is editing' flag for packlists and inventories that locks other users out.
- [x] impliment edithistory for packlists (complete for inventory, not complete for multilayer packlist data)
- [x] add info source to metadata history to track inventor / app update location for packlists
- [x] improve error handling and user notifications for failed auth and failed permissions
- [x] notes on page endpoints for user communication
- [?] out of network offline mode handling for auth and data access. Allow reactiveStores and all caching to freeze as infinite when offline. Disable all mutation functions. Notify users of offline status and limitations.
- [?] remove cache timeout for database access and allow these caches to work as offline functionality, saving in longterm storage and pushing if necessary when reconnected
- [x] consider moving "Reports" to its own endpoint that includes all reports and analytics settings.
- [x] consider simplifying the inventory once reports is moved by adding a simple toggle for category vs all-inventory-table view and removing the categories endpoint.
- [ ] ! Provide tools to revert changes from history, and tools to revert based on source
- [ ] save deleted information in a special table for recovery if necessary
- [ ] allow auto-caching of analytics data
- [ ] we probably need to allow multiple identical dashboard endpoints to be added with different views if we do the inventory category mode thing.
- [ ] allow "maintenance mode" activated that locks all editing, OR simply allow the system to force clients to refresh
      allow analysis to intelligently slow or pause itself and notify user for slow connection states.
      allow unused reactiveStores to self-clean to save memory after a period of inactivity
      CONSIDER a reactive store priority that allows reactive stores to flush unused memory based on usage and importence rather than keeping all data around.

show management system

- [x] link shows to pack lists
- [x] advanced search and preset system
- [x] default schedule ship date as analytics step
- [x] text-match needs to have a dropdown to determine type of match (includes, excludes, etc.)
- [x] allow text field omission in advanced search (ex: return results that do not have a certain client name, or location, etc)
- [x] move indexes to app data and start using live table for information
- [x] detection and addition of new shows into index
- [x] calendar view of shows
- [x] advanced search needs to filter columns available to search types by data type. Data types need to be more strictly defined in the show data system
- [x] advanced search should allow user to filter based on type: by date, text-match, show overlap (special type)
- [x] think through json date searches. Possibly need to decide on normal schedule match behaviors to allow rather than all.
- [x] date search needs to have a dropdown to determine type of match (before, after, before inclusive, after inclusive, etc.)
- [ ] ! add "views" system to show different columns and layouts for different purposes
- [ ] ! we need to support packlist transshipping in schedule and doing packlist merges when transship shows overlap
- [ ] ! we may need a workzone integration
- [ ] advanced search add and configure boolean flag columns (shown as checkboxes) and filter option
- [ ] allow sorting, categorization (viewable/hidden in certain domains), and organization of saved searches

      allow user to access show searches as pages and pin to dashboard
      analyze and show the rough number and complexity of shows throughout the year and provide work estimate reporting

Pack Lists in Web

- [x] Get pack list data from web and display
- [x] Allow addition of new crates
- [x] Allow crate contents edit
- [x] Allow addition of new items
- [x] Allow deletion of items
- [x] Allow moving items
- [x] Allow editing item contents
- [x] allow saving edits to google sheet
- [x] allow packlist main page to be refreshed (cards-grid refresh button)
- [x] new items from inventory with easy navigation
- [x] allow packlist text search and filtering
- [x] Allow packlist item categorization and hiding, ex: select a whole set of hardware and categorize as "BeMatrix Hardware", then move that set to hidden row as a list.
- [x] Allow categorized item finding, viewing (in row details), checking (integrate into analysis steps), and check/update (via inventor).
- [x] Allow new packlists from template
- [x] Allow duplicate packlists from existing packlists (add to main packlist page, and as an action on a packlist)
- [x] add category filtering to packlist-details table
- [x] allow group closing and hiding in actions bubbles and default to this
- [x] information source notification if source is inventor, and allow easy rollback of inventor history updates
- [x] cut and paste between packlist functionality
- [ ] !!!!detection of unattached packlists and user notification
- [ ] !!! when pasting in from external source, naturally find drop columns at time of paste, and add the just-pasted rows to the selection set
- [ ] !!! add "add to new crate" as item selection button
- [ ] !!! add "move to existing crate" as item selection button
- [ ] !!! add "move rows" as bubble action
- [ ] ! enable actions bubbles for crates selections
- [ ] ! automations interface, packlist rules (see suggestions at top of notes)
- [ ] allow user to configure automations
- [ ] automatic packlist rule suggestion jobs run in the background?
- [ ] description change recommendations for common or similar items that checks or aggregates history potentially?
- [ ] automations automatically allow for quick addition of typical client or show items
      create a more advanced filtering component for tables that includes multi-select, ranges, and text search and integrates with urlparams similar to the advanced search select
      allow adding items to inventory through packlist via simple interface (use item as description, extract quantity if exists, user choose category, auto add and save)

dropbox / workzone / sql integrations

- [ ] dropbox service account and auth sync
- [ ] identify and show versions/dates of output files
- [ ] allow opening link to dropbox or workzone pdfs
- [ ] microsoft server or google workspace integration?

checklist, reports, and notes system

      create and edit checklists
      template checklists
      complete checklists
      link checklists to products
      allow template checklist linking to product areas: packlists, inventories, shows
      allow template checklists to be applied based on triggers
      allow logical checklist creation from data (ex: packlist items checklist)
      integrate with notifications
      integrate with automations

analysis of pack list against current inventory

- [x] quantities
- [x] overlapping shows
- [x] low stock warnings
- [x] description updates
- [x] using inventory/reports endpoint, and loading the saved searches into the table, build a report table
- [x] make url param updates correctly propagate into components, and fix report url generation
- [x] allow report text filtering
- [x] allow showing quantity errors in a special schedule view, or always run this as an analysis step in schedule view. This needs to not explode computers. May need analysis caching first.
- [ ] run configured upcoming inventory shortage report automatically on main inventory page and show warnings in items and categories
      increase the filtering options in reports
      link to quick reports from other locations (ex: advanced-search, or from inventory for upcoming shows, or from packlist details, etc)
