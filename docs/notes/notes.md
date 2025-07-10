**Use Cases**
We can have pack lists generated from Inventor
We can know if there are item shortages as pack lists are generated
If we add bematrix stuff to pack lists, we can also check inventory qty of them
If we auto generate packlists from concept models, we can get an early alert of possible inventory issues as those shows are approved
We can get an inventory report of item quantities throughout the year



**Minimum Features To Show:**
- Export Basic Pack List from Inventor
    - Categorize all booth parts according to Pack List Rules (preferences)
    + Create new pack list in Google Sheets
    + Input items into Google Sheets
    > (PLANNED) Open existing pack list and cross-reference before adding new parts, only adding parts that are not already present
- Open Pack List in Web
    + Get pack list data from web and display
    - Allow addition of new crates
    + Allow crate contents edit
        + Allow addition of new items
        + Allow deletion of items
        + Allow moving items
        + Allow editing item contents
    - allow saving edits to google sheet
    + warnings for items that are unavailable



**To do:**
add verification when closing a tab
Set up a queue for packlist overlaps and cache data. If there are multiple tabs open, run for all open tabs at once while avoiding rate-limiting.
Allow multiple workspaces?
Inject the sheet ids and the api-key via github soas not to expose them
allow modals to recieve the arrow keys and enter button
remove reliance on google sheets fuzzymatching for identifyers - or make google sheets fuzzymatching set the cell contents instead of dynamically load
make sure cache renewal is logical
ensure that everything works if ben and DY simultaneously edit
auth last longer than an hour
create backup of packlists before saving packlist to ensure no data loss
Track crate information to further streamline pack list generation
Impliment a pack list suggestion system to quickly add typical client or show items
Provide a feedback mechanism for users to suggest improvements or report issues
Provide a user-friendly interface to locate and update item status
Allow for item images to be uploaded for better identification
Customizable User Dashboards


**Learning:**
Google oAuth2 for client-only apps requires a token refresh every hour, no exceptions
Google drive rate-limits queries, making it difficult to realtime-check tons of stuff -> this impacts the ability to open multiple tabs at once




**Regexes:**

##
Split long description into component parts:
1: "on top" or null
2: count number or null
3: part number "CAB-001" etc
4: remaining text

@"^(?:(on top):)? ?(?:\(([0-9]+)\))? ?([A-Z]+-[0-9]+[a-zA-Z]?)? (.+)$"gmi
##





**Element Examples:**

tag in a cell:

<tr class="draggable"><td class="row-drag-handle"></td><td style="
    /* background-color: #fdd; */
">(2) CAB-005
<span class="table-cell-warning"><strong>Warning: </strong>Only 1 CAB-005 left in stock</span>
</td><td>Booth # W3067</td></tr>


modal:

<div class="modal"> 
    <div class="modal-content">
        <div class="modal-header">Open Pack List:<span class="modal-close">&times;</span></div>
        <h2>New Tab</h2>
        <p>Content for the new tab goes here.</p>
    </div>
</div>

