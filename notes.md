**Vision**

Assumptions:
Dave's time is valuable.
Dave currently spends time building pack lists from diverse sources of information.
If Dave requires information about current inventories that he and Ben do not already have, he must rely on Dan's potentially outdated information or time-consuming warehouse searching.
In order to assess show overlaps and present inventory quantities, Dave must combine these pieces of information with other cross-references from the production schedule.
Dan, Patrick, and Daniel can typically easily manage the workload of concept and control drawings.

Goals:
Allow Dave to focus on reviewing pack lists instead of writing them from scratch
Provide Dave and Ben with easy and early access to current item quantities and show overlaps
Provide Ben with easy access to item history and possible location

Responsibilities:
THROUGHOUT THE YEAR: Daniel maintains the stability of a web app that provides functionality to the company
THROUGHOUT THE YEAR: Ben and Dave use easy tools to maintain the accuracy of our live inventory quantities, keeping track of damaged or destroyed items
AS REQUESTED OR AT THE TIME ELEVATIONS ARE PRODUCED: Daniel, Dan, or Patrick use easy tools to generate basic pack lists from CAD models and inventories
AS EARLY AS DESIRED: Dave uses easy tools to check, organize, and export pack lists




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

Set up a queue for packlist overlaps and cache data. If there are multiple tabs open, run for all open tabs at once while avoiding rate-limiting.
Allow multiple workspaces?
Inject the sheet ids and the api-key via github soas not to expose them
allow modals to recieve the arrow keys and enter button
remove reliance on google sheets fuzzymatching for identifyers - or make google sheets fuzzymatching set the cell contents instead of dynamically load
make sure cache renewal is logical
ensure that everything works if ben and DY simultaneously edit
auth last longer than an hour




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

