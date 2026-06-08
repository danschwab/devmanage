## Present

delete beckman cyto
analytics off
log out
hard refresh browser and log in again
go to inventory and wait for icons to load, then all packlists and wait for them to load
set packlists filter to upcoming

1. Export packlist from Inventor
   - Am I correct that currently, we manually create packlists as spreadsheets based on renderings?
   - Dan and I have a full accurate model of the exhibit when we generate elevations documents.
   - The first thing my application does is allow us to export that model and open it as a packlist.
     [DEMO - BECKMAN CYTO]
   - This packlist is fully editable, and can be printed in our standard format.
     [QUICK DEMO - add crate, drag rows, delete a cell, edit a cell, save, print]
     [NOTE] We can easily use this past year of Excel packlists by allowing copy-paste from existing spreadsheets, or a simple import feature.
2. Harvests information from production schedule
   - Our production schedule in google sheets has lots of information about our shows, and I can pull that information in and connect packlists to it.
     [DEMO - go to schedule select upcoming]
   - This is a filter of shows in the next month. We can see all the information and see what packlists are not yet generated.
     [NOTE] If we move project management entirely to Workzone, I can pull this information straight from Workzone.
3. Contains our current inventory and allows easy updates
   - For the past several years, we have kept track of much of our inventory. I can pull that info in as well.
   - I have built some tools to allow us to easily search and update the inventory.
     [NOTE] If we decide to pull this data into Access's barcode system, I can help manage importing data and use that database in this app.
4. Shows inventory shortages and overlapping shows as pack lists are generated
   - The last feature I want to show you is the analysis that is possible with this information. Let's look at an item-shortage report for the next month.
     [DEMO - shortages report for upcoming shows, note panel shortage]
   - If I enable analysis, and we navigate back to packlists, there is a ton of information that is at our fingertips, and a ton of ways to explore that info.
     [DEMO - enable analysis, follow the link to the packlist with the shortage]

## Important Notes

- Allow and request email feedback from users
- Bundle changes into updates, carefully log changes made, and send out a release email before making the updates

## NOTES

whenever possible, rely on the caching system instead of data from live tables.
Google drive rate-limits queries, making it difficult to realtime-check tons of stuff -> this impacts the ability to open multiple tabs at once
We can potentially save Dropbox service account keys in google drive and use them to access our dropbox files without user auth. This risks key exposure.

Inventory Handling:
Standard: FURNITURE, CABINETS, HANGING SIGNS, COUNTERTOPS, SHELVES, LIGHTBOXES, LIGHTING
Special logic to support finding items: HARDWARE
In standard descriptions: Power strips? Cables? Keyboards and mice? Remotes? Antennas?
Consolidated tracked: BEAMATRIX PANELS & HARDWARE
Extra tracking: ELECTRONICS, MONITORS
Will come in uninventoried: Client or new items shown in booth, Decorative Items
Rules: Typical Client Items, Tools and Supplies, Tech Accessories
?: Monitor arms? Remotes and power strips?

Need features:

- add new rows at end of packlist (client items, tools, etc)
- add a row following an item for typical inclusions (carpet + pad, monitor + cabling, etc)
- consolidate, but still track items (beMatrix panels and hardware)
- track unique items (electronics with serial numbers, passwords, locations)

For design and project queue:

- checklists for each item? Define checklists for items somehow? Checklists with username requirements? User table? Checklists with linked data entry fields?
- show what pdfs are exported for each project
- nebulus project stages, base on current system: projects are requested, updated, communicated via email. Put all information in one place, but allow tags and filters? Or force update notes to be connected to a category or checklist?
- if certain documents exist, they are assumed correct - force approvals? Assume approvals for certain types of projects? Allow document approvals to be revoked? Approvals are just checklists?
- checklists need to have the ability to link to styles in schedule views. We have advanced search, maybe add "Advanced Views" that allows custom columns, column styling based on rules, etc? Should this be hardcoded?
- allow calendar view of shows. Allow drag and drop scheduling for show dates and ship/ret date thresholds? Maybe the interface should allow "card view", "table view", and "calendar view" for things? Hard code, or option for user?
- Notifications system? Integrate emails? Allow checkbox or defaults for recipients? Default text? Allow templates? Should the system allow changes via email replies?

## Primary Use Cases

- [80%] We can have pack lists generated from Inventor
- [95%] We can know if there are item shortages as pack lists are generated
- [100] If we add bematrix stuff to pack lists, we can also check inventory qty of them
- [50%] If we auto generate packlists from concept models, we can get an early alert of possible inventory issues as those shows are approved (needs approval system)
- [50%] We can get an inventory report of item quantities throughout the year
- [ 0%] We can migrate all our checklists and schedule management to this system
- [40%] All of our data is available and easy to update on the go

## TO DO

**chores**

- [ ] unify the styling of cards and buttons
- [x] make table headers accessible when scrolling, on hover over the sticky header?
- [ ] reports column headers percentage based and dynamically abbreviate
- [ ] basic schedule table needs to have return and show date columns visible
- [ ] basic schedule table needs to allow wide table
- [ ] packlist interface somehow show "was previously" during edits
- [x] Inject the sheet ids and the api-key via github soas not to expose them
- [x] remove hamburger buttons that do nothing
- [x] packlist print titleblock??
- [x] add context variables to live site github
- [x] refresh buttons should clear caches
- [x] fix packlist table header alignment
- [x] simplify and impliment more url filling and parameter saving in nav and back buttons (for instance breadcrumb nav should cache some url params)
- [x] tableComponent finder needs: a clear all button
      clickable and highlightable (can copy contents) table cells instead of cell buttons

**problems**

- [ ] when exporting from concept, does it use curent assembly, or separately find control????? if control model exists, ask if use that
- [?] for some reason, changes still arent loading into inventory when I leave and go back... my unsaved changes go away
- [x] make external clicks clear checkboxes
- [x] icons still don't show for dan
- [ ] allow pasting even if only a single column of data is copied
- [ ] ui for paste
- [ ] advanced schedule search needs to allow date picker to override dropdown, and dropdown auto-change if date changes
- [x] !!!! Inv Reports table: item#, startdate, enddate, minqty, overlapping shows with that item
- [x] reverse packlist pin/unpin view, and add the "show pinned packlists" tooltip to the item
- [x] remove drag into bottom to delete.
- [x] collapsed groups mess up drop targets
- [x] don't highlight fields in basic tables...
- [x] add tooltip "3 rows copied..."
- [x] garbage can icon for deletion!!!!
- [x] fix thumbnail access
- [ ] error occurred 11:00 updating cache datestamp?
- [x] add misc inventory table
- [ ] allow "maintenance mode" activated that locks all editing

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
- [ ] !!! I have not tested what happens if two users simultaniously trigger resolution
- [x] !!! fix thumbnails again: Consider a thumbnail table? make the analysis step invalidation ignore repeat invalidations: analysis invalidation reruns need to have a delay timer built in that gets pushed out, and cancelled if main data invalidates, and don't listen for analysis invalidation during main data load
- [ ] !!! fix thumbnails again: need reliable thumbnail cache table, thumbnails fail to load in rare cases if reauth while component unmounted? We need image urls to load reliably as an early step and not flicker into view.
- [?] !!! thumbnails not showing for dan
- [?] !!! inventory table first edits are not shown as table-dirty after first nav away and back. Same for second/third edits if all done in quick sequence. Probably lock and flicker-prevention related.
- [x] ! nonexistant packlists throw no access error when viewed, and fail to save. They should be savable from this view, or throw a 404 error.
- [ ] date columns are not always presenting as dates, especially the ship date, in searches
- [?] dan ran into issue where at slow speeds, the inventory categories didn't load and never refreshed
- [ ] autosave backup is currently broken, probably because of failure to identify user tab or backup entries correctly
- [ ] if there are duplicate shows on the production schedule, they are duplicated in reports
- [ ] packlist print from dashboard will not print correctly if not on packlist page first
- [ ] redundancy and overcomplexity in navigation still must be reduced
- [ ] the functions that manage schedule indexing need to be reworked for simplicity and brought in line with caching mechanisms...
- [ ] packlist item shortage alerts are still broken!!!!!!

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
- [ ] !!! need the packlist export to ensure that the abbreviations are correct linking to a show if no show found
- [ ] !!! fix CABINET item numbers in inventor
- [ ] !!! fix FURNITURE item numbers in inventor
- [ ] !!! fix HANGING SIGN item numbers in inventor
- [ ] !!! fix duplication of bematrix VELCRO PANELS
- [ ] !!! fix 45 degree curved panels
- [ ] !!! verify panel and hardware and other possible edge-cases
- [x] !!! Add support to automatically group items
- [ ] !!! allow pack list export from project manager
- [ ] ! fix system that checks for diff and allows updates to existing packlist instead of full overwrite
- [ ] ! allow item metadata history and change source updating from inventor, and ensure inventor doesn't auto-update an in-app change without confirmation
- [ ] show notifications if the packlist was in-app changed to not match the current model for inventoried items
      automatically add thumbnails for uninventoried items?

notifications system

- [ ] !!! Provide a feedback mechanism for users to suggest improvements or report issues
- [ ] allow notifications throughout application to be picked up by components
- [ ] basic notification center on dashboard

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
- [ ] optimize thumbnails: app data sheet needs to have a table of thumbnail locations that is loaded and checked before calling the function that gets thumbnail folder contents
- [ ] optimize thumbnails: invalidate this cache only when new thumbnails are added, or a thumbnail change occurrs
- [ ] ! update LIGHTBOXES
- [ ] ! add all FURNITURE
- [ ] ! add all LIGHTING
- [ ] track crate information to further streamline pack list generation (Crate UI similar to packlists? Allow Ben to manage crates, and analysis search/suggest typical crates when editing a packlist?)
- [ ] ensure inventory table generation is unified so changes propegate throughout components and reports correctly
- [ ] allow attaching a change dates to a project
- [ ] create a history modification utility for viewing changes over time and changing their values if necessary
      allow uploading new item thumbnails
      allow assigning and tracking items with unique ids. ex: cradlepoint routers with individual serial numbers, passwords, and location info attached in inventory and tracked separately
      item status interface to locate items and update item status
      We could integrate a repair schedule and other things into this system for a complete inventory management system

show management system

- [x] link shows to pack lists
- [x] advanced search and preset system
- [x] default schedule ship date as analytics step
- [x] text-match needs to have a dropdown to determine type of match (includes, excludes, etc.)
- [x] allow text field omission in advanced search (ex: return results that do not have a certain client name, or location, etc)
- [x] !!! move indexes to app data and start using live table for information
- [x] !!! detection and addition of new shows into index
- [ ] ! add "views" system to show different columns and layouts for different purposes
- [ ] ! we need to support packlist transshipping in schedule and doing packlist merges when transship shows overlap
- [ ] ! we may need a workzone integration
- [ ] advanced search needs to filter columns available to search types by data type. Data types need to be more strictly defined in the show data system
- [ ] advanced search should allow user to filter based on type: by date, text-match, show overlap (special type), and boolean flags (future)
- [ ] think through json date searches. Possibly need to decide on normal schedule match behaviors to allow rather than all.
- [ ] date search needs to have a dropdown to determine type of match (before, after, before inclusive, after inclusive, etc.)
- [ ] allow sorting, categorization (viewable/hidden in certain domains), and organization of saved searches
      express checklist columns as checkboxes
      allow user to access show searches as pages and pin to dashboard
      analyze and show the rough number and complexity of shows throughout the year
      calendar view of shows

dropbox / workzone / sql integrations

- [ ] dropbox service account and auth sync
- [ ] identify and show versions/dates of output files
- [ ] allow opening link to dropbox pdfs
- [ ] microsoft server or google workspace integration?
- [ ] migrate thumbnails to shared folder in microsoft server? and allow uploading new thumbnails to dropbox???

Architecture Improvements

- [x] dashboard configuration
- [x] user preferences storage
- [x] ReactiveStore periodically save data to spreadsheet, and check + load data from spreadsheet to prevent data loss on accidental tab close or crash. Notify user "recovered unsaved changes..."
- [x] extra spreadsheet EditHistory column
- [x] save history: dateTime, userName, fields edited & old values
- [x] reactiveStore efficiency: stack, prioritize, and batch api calls from reactiveStores to ensure application data is available first without hitting rate limits
- [x] log out needs to skip database operations if the token is already expired
- [x] locking and edit rules to prevent simultaneous edits: 'is editing' flag for packlists and inventories that locks other users out.
- [?] impliment edithistory for packlists (complete for inventory, not complete for multilayer packlist data)
- [x] add info source to metadata history to track inventor / app update location for packlists
- [x] improve error handling and user notifications for failed auth and failed permissions
- [ ] ! Provide tools to revert changes from history, and tools to revert based on source
- [ ] save deleted information in a special table for recovery if necessary
- [ ] allow auto-caching of analytics data
      allow unused reactiveStores to self-clean to save memory after a period of inactivity
      CONSIDER a reactive store priority that allows reactive stores to flush unused memory based on usage and importence rather than keeping all data around.
      remove cache timeout for database access and allow these caches to work as offline functionality, saving in longterm storage and pushing if necessary when reconnected

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
- [ ] ! enable actions bubbles for crates selections
- [ ] ! automations interface, packlist rules
- [ ] allow user to configure automations
- [ ] automatic packlist rule suggestion jobs run in the background?
- [ ] description change recommendations for common or similar items that checks or aggregates history potentially?
- [ ] automations automatically allow for quick addition of typical client or show items
      create a more advanced filtering component for tables that includes multi-select, ranges, and text search and integrates with urlparams similar to the advanced search select
      allow adding items to inventory through packlist via simple interface (use item as description, extract quantity if exists, user choose category, auto add and save)

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
- [x] make url param updates correctly propegate into components, and fix report url generation
- [x] allow report text filtering
- [ ] allow showing quantity errors in a special schedule view, or always run this as an analysis step in schedule view. This needs to not explode computers. May need analysis caching first.
      increase the filtering options in reports
      link to quick reports from other locations (ex: advanced-search, or from inventory for upcoming shows, or from packlist details, etc)

**maybe**
change style system so that color variables are set via classes on components, and those variables set the "--color-\*" variables per component instead of globally.
quick action buttons on cards?
allow analysis to intelligently slow or pause itself and notify user for slow connection states.
implement notes and checklists
workspace system with multiple dashboards?
allow modals to receive the arrow keys and enter button
create backup of packlists before saving packlist to ensure no data loss
find missing show or client index info and allow user to add it
user preferences (allow delay save)
add an optional flag that adds a start and end date selector to the ScheduleFilterSelect button-bar.
