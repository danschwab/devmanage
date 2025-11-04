## NOTES

whenever possible, rely on the caching system instead of data from live tables.
Google oAuth2 for client-only apps requires a token refresh every hour, no exceptions
Google drive rate-limits queries, making it difficult to realtime-check tons of stuff -> this impacts the ability to open multiple tabs at once

Inventory Handling:
Standard: FURNITURE, CABINETS, HANGING SIGNS, COUNTERTOPS, SHELVES, LIGHTBOXES, HARDWARE, LIGHTING
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

## Primary Use Cases

- [30%] We can have pack lists generated from Inventor
- [90%] We can know if there are item shortages as pack lists are generated
- [30%] If we add bematrix stuff to pack lists, we can also check inventory qty of them
- [ 0%] If we auto generate packlists from concept models, we can get an early alert of possible inventory issues as those shows are approved
- [ 0%] We can get an inventory report of item quantities throughout the year
- [ 0%] We can migrate all our checklists and schedule management to this system
- [10%] All of our data is available and easy to update on the go

## TO DO

**chores**

- [x] Inject the sheet ids and the api-key via github soas not to expose them
- [ ] make thumbnails be a cached analytics step
- [ ] add context variables to live site github

**problems**

- [x] container path update in packlistTable accidentally redirects the dashboard to the path as well. Fix this by making the edit endpoint not be a path location, but be a table mode instead.
- [x] error causing early dashboard changes to be overwritten by an empty dashboard
- [x] error causing card component to lose analytics details on reload after cache clear???
- [ ] ensure log out/in does not break things: the pin button currently breaks on reauth
- [ ] error causing logout to not clean up all data and cause errors on reauth (username set to "User" instead of actual username)
- [ ] New or empty packlists have the wrong headers: fix hardcoded templating and row showing errors
- [ ] scrolling issue when navigating
- [ ] error causing unsyncing of packlist saves, especially when data or rows are deleted
- [ ] error causing imperfect or corrupted analytics information on data refresh after auth
- [ ] github deployment needs to be rerun every time due to config.js build issues?

**Application tasks**

Architecture Improvements

- [x] dashboard configuration
- [ ] user preferences storage
- [ ] consider always checking the metadata last-edited date before saving to prevent overwriting simultaneous changes?
- [ ] locking and edit rules to prevent simultaneous edits: 'is editing' flag for packlists and inventories that locks other users out.
- [ ] ReactiveStore periodically save data to spreadsheet, and check + load data from spreadsheet to prevent data loss on accidental tab close or crash. Notify user "recovered unsaved changes..."
- [ ] extra spreadsheet MetaData column
- [ ] save history: dateTime, userName, fields edited & old values
- [ ] Provide tools to revert changes from history
      reactiveStore efficiency: stack, prioritize, and batch api calls from reactiveStores to ensure application data is available first without hitting rate limits
      allow unused reactiveStores to self-clean to save memory after a period of inactivity
      remove cache timeout for database access and allow these caches to work as offline functionality, saving in longterm storage and pushing if necessary when reconnected

HIGH PRIORITY: Export Basic Pack List from Inventor

- [x] Create new pack list in Google Sheets
- [x] Input items into Google Sheets
- [x] Open existing pack list and cross-reference before adding new parts, only adding parts that are not already present
- [ ] Categorize all booth parts according to Pack List Rules (preferences)
- [ ] Improve and test this system

MEDIUM PRIORITY: Pack Lists in Web

- [x] Get pack list data from web and display
- [x] Allow addition of new crates
- [x] Allow crate contents edit
- [x] Allow addition of new items
- [x] Allow deletion of items
- [x] Allow moving items
- [x] Allow editing item contents
- [x] allow saving edits to google sheet
- [ ] Allow packlist item categorization and hiding, ex: select a whole set of hardware and categorize as "BeMatrix Hardware", then move that set to hidden row as a list.
- [ ] Allow categorized item finding, viewing (in row details), checking (integrate into analysis steps), and check/update (via inventor).
- [ ] allow new packlists from template, allow duplicate packlists from existing packlists (add to main packlist page, and as an action on a packlist)
- [ ] automations interface, packlist rules
- [ ] allow user to configure automations
- [ ] automatic packlist rule suggestion jobs run in the background?
- [ ] description change recommendations for common or similar items that checks or aggregates history potentially?
- [ ] automations automatically allow for quick addition of typical client or show items

analysis of pack list against current inventory

- [x] quantities
- [x] overlapping shows
- [x] low stock warnings
- [x] description updates

HIGH PRIORITY: inventory updates

- [ ] include all current categories
- [ ] Improve inventory item finding: match actual bematrix hardware to inventory bematrix item numbers
- [x] allow editing of item quantities
- [x] allow editing of item descriptions
- [ ] allow adding new items
- [ ] allow assigning and tracking items with unique ids. ex: cradlepoint routers with individual serial numbers, passwords, and location info attached in inventory and tracked separately
- [x] add existing item thumbnails
- [ ] allow uploading new item thumbnails
- [ ] track crate information to further streamline pack list generation
      item status interface to locate items and update item status

show management system

- [x] link shows to pack lists
- [ ] create and edit shows
      analyze and show the rough number and complexity of shows throughout the year
      calendar view of shows

notifications system

- [ ] allow notifications throughout application to be picked up by components
- [ ] basic notification center on dashboard
      Provide a feedback mechanism for users to suggest improvements or report issues

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

- view table details in modal or as dropdown default
- default settings for primary page views
