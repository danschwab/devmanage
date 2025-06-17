**Ideas:**

Allow multiple workspaces?
Inject the sheet ids and the api-key via github soas not to expose them
allow modals to recieve the arrow keys and enter button
remove reliance on google sheets fuzzymatching for identifyers - or make google sheets fuzzymatching set the cell contents instead of dynamically load
make sure cache renewal is logical
ensure that everything works if ben and DY simultaneously edit
auth last longer than an hour



**Regexes:**

##
Split long description into component parts:
1: "on top" or null
2: count number or null
3: part number "CAB-001" etc
4: remaining text

@"^(?:(on top):)? ?(?:\(([0-9]+)\))? ?([A-Z]+-[0-9]+)? ?(.+)$"gmi
##





**Element Examples:**

tag in a cell:

<tr class="draggable"><td class="row-drag-handle"></td><td style="
    /* background-color: #fdd; */
">(2) CAB-005<span style="
    display: block;
    border: 1px solid red;
    padding: .25em;
    margin-top: .5em;
    background-color: #f99;
    border-radius: 4px;
"><strong>Warning: </strong>Only 1 CAB-005 left in stock</span></td><td>Booth # W3067</td></tr>


modal:

<div class="modal"> 
    <div class="modal-content">
        <div class="modal-header">Open Pack List:<span class="modal-close">&times;</span></div>
        <h2>New Tab</h2>
        <p>Content for the new tab goes here.</p>
    </div>
</div>

