**Regexes:**

##
Split long description into component parts:
1: "on top" or null
2: count number or null
3: part number "CAB-001" etc
4: remaining text

@"^(?:(on top):)? ?(?:\(([0-9]+)\))? ?([A-Z]+-[0-9]+)? ?(.+)$"gmi
##
