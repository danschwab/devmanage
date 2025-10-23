## WORK

**important:**
whenever possible, rely on the caching system instead of data from live tables.
Google oAuth2 for client-only apps requires a token refresh every hour, no exceptions
Google drive rate-limits queries, making it difficult to realtime-check tons of stuff -> this impacts the ability to open multiple tabs at once

**to do:**

- container path update in packlistTable accidentally redirects the dashboard to the path as well. Fix this by making the edit endpoint not be a path location, but be a table mode instead.
- find error causing early dashboard changes to be overwritten by an empty dashboard
- find error causing unsyncing of packlist saves, or attribute it to fakeGoogle
- New or empty packlists have the wrong headers: fix hardcoded templating and row showing errors

- ensure that everything works if ben and DY simultaneously edit

  - 'is editing' flag for packlists and inventories that locks other users out.

- extra spreadsheet MetaData column
  - save history {dateTime, userName, fields[], old values[]}
- allow new packlists from template, allow duplicate packlists from existing packlists
- implement packlist rules, and automatic packlist rule suggestion jobs
  - description change recommendations for common or similar items that checks or aggregates history potentially?
  - quickly add typical client or show items
- Improve inventory item finding: match actual bematrix hardware to inventory bematrix item numbers
- Allow packlist item categorization and hiding, ex: select a whole set of hardware and categorize as "BeMatrix Hardware", then move that set to metadata.
  - Allow metadata finding, viewing (in modal?), checking (analysis steps), and updating (via inventor).
- Inject the sheet ids and the api-key via github soas not to expose them

**maybe:**
quick action buttons on cards?
allow analysis to intelligently slow or pause itself and notify user for slow connection states.
implement notes and checklists
workspace system with multiple dashboards? Easily pin to dashboard?
allow modals to receive the arrow keys and enter button
create backup of packlists before saving packlist to ensure no data loss

## MVP

**Use Cases**
We can have pack lists generated from Inventor
We can know if there are item shortages as pack lists are generated
If we add bematrix stuff to pack lists, we can also check inventory qty of them
If we auto generate packlists from concept models, we can get an early alert of possible inventory issues as those shows are approved
We can get an inventory report of item quantities throughout the year
We can migrate all our checklists and schedule management to this system
All of our data is available and easy to update on the go

**Application outline**

- Export Basic Pack List from Inventor
  - Categorize all booth parts according to Pack List Rules (preferences)
  * Create new pack list in Google Sheets
  * Input items into Google Sheets
  * Open existing pack list and cross-reference before adding new parts, only adding parts that are not already present

* Pack Lists in Web
  - Get pack list data from web and display
  - Allow addition of new crates
  - Allow crate contents edit
    - Allow addition of new items
    - Allow deletion of items
    - Allow moving items
    - Allow editing item contents
  - allow saving edits to google sheet
  * automations interface
    - allow user to configure automations (description updates, item extraction, notifications)

- analysis of pack list against current inventory

  - quantities
    - overlapping shows
    - low stock warnings
  - description updates

- inventory updates

  - include all current categories

  * allow editing of item quantities
  * allow editing of item descriptions

  - allow adding new items
  - thumbnails
    - add existing item thumbnails
    - allow uploading new item thumbnails
  - item status interface to locate items and update item status
  - track crate information to further streamline pack list generation

- show management system

  - create and edit shows
  - analyze and show the rough number and complexity of shows throughout the year

  * link shows to pack lists

- notifications system
  - allow notifications throughout application to be picked up by components
  - basic notification center on dashboard
- checklist and reports system

  - create and edit checklists
  - template checklists
  - complete checklists
  - link checklists to products
    - allow template checklist linking to product areas: packlists, inventories, shows
    - allow template checklists to be applied based on triggers
    - allow logical checklist creation from data (ex: packlist items checklist)
    - integrate with notifications
    - integrate with automations

- application and meta data storage and use in google sheets
  - dashboard configuration
  * save edit history and provide tools to view and revert changes
  * user preferences storage
  * locking and edit rules to prevent simultaneous edits
  * Provide a feedback mechanism for users to suggest improvements or report issues
