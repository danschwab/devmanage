/**
 * Fake Google Sheets implementations for testing purposes
 * Provides dummy data and authentication objects that mirror the real GoogleSheetsAuth and GoogleSheetsService
 */

import { SheetSql } from './sheetSql.js';

export class FakeGoogleSheetsAuth {
    static userEmail = 'test@example.com';
    static isInitialized = false;
    static isAuthenticatedState = false;
    static mockToken = {
        access_token: 'fake_access_token_12345',
        token_type: 'Bearer',
        expires_in: 3600,
        timestamp: Date.now()
    };

    static async initialize() {
        console.log('FakeGoogleSheetsAuth: Initializing...');
        await this.delay(100); // Simulate async initialization
        this.isInitialized = true;
        return true;
    }

    static async authenticate() {
        console.log('FakeGoogleSheetsAuth: Authenticating...');
        await this.delay(200); // Simulate authentication delay
        this.isAuthenticatedState = true;
        this.storeToken(this.mockToken);
        return true;
    }

    static async checkAuth() {
        if (!this.isInitialized) {
            await this.initialize();
        }
        return this.isAuthenticatedState && !this.isTokenExpired(this.getStoredToken());
    }

    static storeToken(token) {
        if (!token) return;
        token.timestamp = new Date().getTime();
        localStorage.setItem('fake_gapi_token', JSON.stringify(token));
    }

    static getStoredToken() {
        const tokenStr = localStorage.getItem('fake_gapi_token');
        return tokenStr ? JSON.parse(tokenStr) : null;
    }

    static isTokenExpired(token) {
        if (!token || !token.timestamp) return true;
        const tokenAge = (new Date().getTime() - token.timestamp) / 1000;
        return tokenAge > 3500; // 1 hour minus buffer
    }

    static clearStoredToken() {
        localStorage.removeItem('fake_gapi_token');
        localStorage.removeItem('fake_last_email');
    }

    static isAuthenticated() {
        return this.isAuthenticatedState && !this.isTokenExpired(this.getStoredToken());
    }

    static async getUserEmail() {
        await this.delay(50);
        return this.userEmail;
    }

    static async logout() {
        console.log('FakeGoogleSheetsAuth: Logging out...');
        this.userEmail = null;
        this.isAuthenticatedState = false;
        this.clearStoredToken();
        await this.delay(100);
    }

    // Utility method to simulate async delays
    static delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export class FakeGoogleSheetsService {
    static SPREADSHEET_IDS = {
        'INVENTORY': 'fake_inventory_sheet_id',
        'PACK_LISTS': 'fake_pack_lists_sheet_id',
        'PROD_SCHED': 'fake_prod_sched_sheet_id',
        'CACHE': 'fake_cache_sheet_id'
    };

    // Mock data for different sheets
    static mockData = {
        'INVENTORY': {
            'FURNITURE': [
                ['ITEM#', 'THUMBNAIL', 'QTY', 'CLIENT', 'NOTES', 'Description', 'Packing/shop notes'],
                ['TABLE-001', '', '2', '', '', 'Conference room table black 30 x 76 x 30', ''],
                ['TABLE-002', '', '2', '', '', 'Glass-top square end table w/ metal bases 18x18x16', ''],
                ['TABLE-003', '', '2', '', '', 'Glass-top rectangular coffee table w/ metal bases 42x18x16', ''],
                ['CHAIR-001', '', '20', '', '', 'Stack Chair ( Black & Black ) w/ Arms', ''],
                ['CHAIR-002', '', '15', '', '', 'Lounge Chair (White Leather) Swivel Barrel', ''],
                ['CHAIR-003', '', '12', '', '', 'Cube chair (black?) collapsible', ''],
                ['CHAIR-004', '', '', '', '', 'Conference swivel chair (white)', ''],
                ['STOOL-001', '', '12', '', '', 'Ikea Glenn Stool, stacking bar-height (White)', ''],
                ['STOOL-002', '', '12', '', '', 'Square Stool, stacking bar-height (White Leather)', ''],
                ['STOOL-003', '', '20', '', '', 'Square Hi-back Stool, stacking bar-height (White Leather)', ''],
                ['COUCH-001', '', '2', '', '', 'white leather curved sofa sections', ''],
                ['TTOP-001', '', '15', '', '', '30" white cocktail table tops-round', ''],
                ['TBASE-001', '', '8', '', '', 'cocktail table bases', '']
            ],
            'Archive': [
                ['Archived Item', 'Date Archived', 'Reason'],
                ['Old Widget', '2025-06-01', 'Discontinued'],
                ['Legacy Tool', '2025-05-15', 'Obsolete']
            ]
        },
        'PACK_LISTS': {
            'TEMPLATE': [
                ['Pack ID', 'Product ID', 'Quantity', 'Destination', 'Status'],
                ['', '', '', '', '']
            ],
            'ATSC 2025 NAB': [
                ['', '', 'Pack List:', '', 'ATSC 2025 NAB', '', '', '', '', 'Ship: Fri. Mar, 28'],
                ['', '', '', '', '', '', '', '', '', 'Setup in shop: Yes'],
                ['Piece #', 'Type', 'L', 'W', 'H', 'Weight', 'Pack', 'Check', 'Description', 'Packing/shop notes'],
                ['1', 'Skid', '72', '32', '48', '800', '', '', '(1) straight-section reception counter (one of two sections). Test lighting', 'Sintra logo- last CES 2025'],
                ['', '', '', '', '', '', '', '', 'Client junk', ''],
                ['2', 'Skid', '120', '48', '48', '1200', '', '', '(3) rolls 10\'x70\' SLATE gray carpeting', ''],
                ['3', 'Skid', '120', '48', '48', '600', '', '', 'Padding for 30x70', ''],
                ['', '', '', '', '', '', '', '', 'Padding For Triveni', 'Booth # W3067'],
                ['4', 'Crate', '72', '48', '48', '800', '', '', '(4) CAB-004 Curved-bottom white demo counter with 30" wide top and LED lighting. (4) standoffs on front and top. Test LED lights', ''],
                ['', '', '', '', '', '', '', '', 'SEG\'s', ''],
                ['', '', '', '', '', '', '', '', 'Blank SEG\'s', ''],
                ['', '', '', '', '', '', '', '', 'Client Packages', ''],
                ['', '', '', '', '', '', '', '', 'Front office items and other inbound client items', ''],
                ['', '', '', '', '', '', '', '', 'All Sintra/foamcore signs', 'New from Olympus'],
                ['', '', '', '', '', '', '', '', 'Set top graphics (paper or foamcore)', 'New from Olympus'],
                ['', '', '', '', '', '', '', '', 'Package (all) cardboard easelbacks prints', 'Office'],
                ['', '', '', '', '', '', '', '', '5" carboard easelbacks packet', 'Inbound purchase'],
                ['', '', '', '', '', '', '', '', '(6) Acrylic wedge blocks/frames 3"x10"', 'Office. Add new prints prior to packing'],
                ['5', 'Crate', '72', '48', '48', '800', '', '', '(4) CAB-004 Curved-bottom white demo counter with 30" wide top and LED lighting. (4) standoffs on front and top. Test LED lights', ''],
                ['', '', '', '', '', '', '', '', 'TEJAS ITEMS- AS RECEIVED', ''],
                ['6', 'Crate', '72', '48', '48', '800', '', '', '(3) CAB-004 Curved-bottom white demo counter with 30" wide top and LED lighting. (4) standoffs on front and top. Test LED lights', ''],
                ['7', 'Coffin Crate', '', '', '', '', '', '', 'On Top: Hanging sign frame 18\'x18\'x5\'', '32 horizontal members; 4 corner posts (54") 12 spreaders (54"+); 8 corner blocks, eye bolts and connectors'],
                ['', '', '', '', '', '', '', '', 'On Top: Hangiing sign fabric cover- ATSC', 'Last- CES 2025'],
                ['', '', '', '', '', '', '', '', 'Sintra prints- all elevations', 'New from Olympus'],
                ['', '', '', '', '', '', '', '', 'Sintra prints existing', 'From CES/NAB'],
                ['', '', '', '', '', '', '', '', 'BeMatrix H/W', ''],
                ['', '', '', '', '', '', '', '', '(10) extra blocking boards for 992 frames', 'Not on BeMatrix pick list'],
                ['', '', '', '', '', '', '', '', '(24) extra metal drop in brackets', 'Not on BeMatrix pick list'],
                ['', '', '', '', '', '', '', '', '(1) Yamaha powered speakers with cords', ''],
                ['', '', '', '', '', '', '', '', 'Corded microphone kit', ''],
                ['', '', '', '', '', '', '', '', 'Wireless presenter\'s kit', ''],
                ['', '', '', '', '', '', '', '', 'White demo counter top @ 48" wide x 20" deep', '3/4"; cut down from a larger oversized top. Drill holes for standoffs for demo cabinet'],
                ['', '', '', '', '', '', '', '', 'Grey countertop with existing grommet caps (black) all in place and taped down', 'Last-CES. Verify size vs. drawing'],
                ['', '', '', '', '', '', '', '', '(2) white counter sections @ 95"x18" for hospitality bar', ''],
                ['', '', '', '', '', '', '', '', '(16) heavy L brackets for shelf supports', 'Packed with Hardware'],
                ['', '', '', '', '', '', '', '', '8.5x11 lit acrylic lit pockets (6)', 'Clean/matching'],
                ['', '', '', '', '', '', '', '', '(6) 19" TV\'s with small mount kits', ''],
                ['', '', '', '', '', '', '', '', 'Square glass cocktail table kit', ''],
                ['', '', '', '', '', '', '', '', '(1) laminated riser from MOJO SHOT show', '30"x30"x12"'],
                ['', '', '', '', '', '', '', '', '(2) 55" Samsung TV screen', 'Top Shelf rentals'],
                ['', '', '', '', '', '', '', '', 'Power cord', ''],
                ['', '', '', '', '', '', '', '', 'Remote with batteries', ''],
                ['', '', '', '', '', '', '', '', 'Wall mount (large)', ''],
                ['', '', '', '', '', '', '', '', 'Arms (for large)', ''],
                ['', '', '', '', '', '', '', '', '(8) 48" sticks @ 3/4" for Sintra posters', 'Cut new'],
                ['', '', '', '', '', '', '', '', '(10) Sintra placard logos', 'New from Olympus'],
                ['', '', '', '', '', '', '', '', 'Existing Sintra logos', 'Office'],
                ['', '', '', '', '', '', '', '', '(2) cocktail table bases', ''],
                ['', '', '', '', '', '', '', '', '(1) 36" white round table tops', ''],
                ['', '', '', '', '', '', '', '', '(3) 30" white round table tops', ''],
                ['', '', '', '', '', '', '', '', '(4) 24" white round tops', ''],
                ['', '', '', '', '', '', '', '', '(4) SEATED table bases (three-piece from Nuance)', 'Collar, base pairs and posts. Check for the metric bolts in the table legs (both ends)'],
                ['', '', '', '', '', '', '', '', 'General supplies', ''],
                ['', '', '', '', '', '', '', '', 'Electrical supplies', ''],
                ['', '', '', '', '', '', '', '', 'Pouch with setups/keys', ''],
                ['8', 'Skid', '96', '48', '60', '', '', '', '(3) Rectangular U-shaped white demo desk with grommet holes top and bottom-back and removable access cover (Sintra). Tape down grommet caps', 'Repair laminate/touch up as needed. Must be finished on both ends. Skin with clean new white Sintra. Matching widths (20")'],
                ['', '', '', '', '', '', '', '', '(5) full size storage racks', ''],
                ['', '', '', '', '', '', '', '', '(2) cocktail table bases', ''],
                ['', '', '', '', '', '', '', '', 'Bar fridge for reception tower', 'Larger bar size. Cleaned.'],
                ['', '', '', '', '', '', '', '', '(1) bar fridge', ''],
                ['', '', '', '', '', '', '', '', '(12) Black fabric arm chairs', ''],
                ['9', 'Skid', '120', '48', '48', '800', '', '', 'All client-supplied TV\'s', 'Inbound/marked'],
                ['', '', '', '', '', '', '', '', 'Top Shelf TV\'s/accessories:', ''],
                ['', '', '', '', '', '', '', '', 'Box of small wall mounts and paired arms', '6 Sets'],
                ['', '', '', '', '', '', '', '', 'Box of large wall mounts and paired arms', '16 sets'],
                ['10', 'Skid', '96', '48', '72', '800', '', '', '(6) IKEA counter-height white stools', 'Tighten foot rests/seats and clean'],
                ['', '', '', '', '', '', '', '', '(22) IKEA BAR-height white stools', 'Tighten foot rests/seats and clean'],
                ['', '', '', '', '', '', '', '', '(3) CURVED LOUNGE CLUB CHAIR-WHITE WITH LEGS', ''],
                ['11', 'Skid', '96', '48', '72', '800', '', '', 'BeMatrix frames/accessories', 'Per separate pack list'],
                ['', '', '', '', '', '', '', '', '(4) 4\'x8\' sheets white Sintra', 'New- for misc. use onsite'],
                ['', '', '', '', '', '', '', '', 'Sintra Graphics', ''],
                ['12', 'Skid', '96', '48', '72', '800', '', '', 'BeMatrix frames/accessories', 'Per separate pack list'],
                ['13', 'Skid', '96', '48', '72', '800', '', '', 'BeMatrix frames/accessories', 'Per separate pack list'],
                ['14', 'Skid', '96', '48', '72', '800', '', '', 'BeMatrix frames/accessories', 'Per separate pack list'],
                ['15', 'Skid', '96', '48', '72', '800', '', '', 'BeMatrix frames/accessories', 'Per separate pack list']
            ]
        },
        'PROD_SCHED': {
            'ProductionSchedule': [
                ['Show', 'Client', 'Year', 'Identifier', 'City', 'Size', 'Booth#', 'S. Start', 'S. End', 'Ship', 'Ship BKD', 'O/B BKD', 'MHA Done', 'Expected Return Date', 'Recieved', 'GC', 'Sup', 'Sup Badge Req.', 'Pack List', 'PL to OPS', 'SOW Sent', 'SOW Ret', 'Elev', 'Panels', 'Setups', 'ER to OPG', 'GD DUE', 'GP DUE', '3rd Party Auth', 'I&D', 'S/U to Elite', 'MH', 'Elec', 'Elec and Net dwg sent', 'H/S', 'H/S dwg sent', 'Net', 'Oth', 'EAC', 'COI', 'DWG (H/S-ELEC) TO SHOW BY', 'S/U IN SHOP'],
                ['SHOT Show', 'Allen Arms', '2025', 'ALLEN ARMS 2025 SHOT', 'Las Vegas, NV', '10x40 & 10x10', '75323 & 75324', '21-Jan', '24-Jan', '1/13/2025', 'X', 'X', 'X', '', '2/3', 'Freeman', 'Top Shelf', '', 'X', 'X', 'X', 'X', 'X', 'X', 'X', '', 'in', '1/10', 'X', 'X', '', 'X', 'X', '', '', '', '', '', 'X', 'X', '10-Dec', ''],
                ['SHOT Show', 'MOJO', '2025', 'MOJO 2025 SHOT', 'Las Vegas, NV', '30x30', '10518', '21-Jan', '24-Jan', '1/10/2025', 'X', 'X', 'X', '', '1/31', 'Freeman', 'Top Shelf', '', 'X', 'X', 'X', 'X', '', '', 'X', '', '', 'X', 'X', '', 'X', 'X', '', 'X', '', '', 'X', '', '', '10-Dec', ''],
                ['SHOT Show', 'Gearfire', '2025', 'GEARFIRE 2025 SHOT', 'Las Vegas, NV', '20x30', '11255', '21-Jan', '24-Jan', '1/10/2025', 'X', 'X', 'X', '', '1/31', 'Freeman', 'Top Shelf', '', 'X', 'X', 'X', 'X', '-', '-', 'X', '', '12/13', '1/9', 'X', 'X', '', 'X', 'X', '', 'N/a', '', '', '', 'X', 'X', '10-Dec', ''],
                ['NADA', 'AWN', '2025', 'AWNINC 2025 NADA', 'New Orleans', '20x20', '3363', '24-Jan', '26-Jan', '1/7/2024', 'X', 'X', 'X', '', '1/28', 'Freeman', 'ELITE', '', 'X', 'X', 'X', 'X', '', '', 'X', '', 'in', 'done', 'X', 'X', '', 'X', 'X', '', 'X', '', '', '', 'X', 'X', '', ''],
                ['SLAS', 'BitBio', '2025', 'BITBIO 2025 SLAS', 'San Diego, CA', '20x20', '349', '26-Jan', '30-Jan', '1/9/2024', 'X', 'X', 'X', '', '2/17', 'Freeman', 'WW', '', 'X', 'X', 'X', 'X', '', '', 'X', '', '12/20', '1/8', 'X', 'X', '', 'X', 'X', '', 'N/a', '', '', '', 'X', 'X', '16-Dec', ''],
                ['Surfaces (TISE)', 'Cyncly', '2025', 'CYNCLY 2025 SURFACES', 'Las Vegas, NV', '40x60', '2057', '28-Jan', '30-Jan', '1/22/2025', 'X', 'X', 'X', '', '2/4', 'Freeman', 'Brian', '', 'X', 'X', 'X', 'X', 'X', 'X', 'X', '', '12/20', '1/20', 'X', 'X', '', 'X', 'X', '', 'X', '', '', '', '', '', '16-Dec', 'X'],
                ['SIO', 'Guerbet', '2025', 'GUERBET 2025 SIO', 'Las Vegas, NV', '10x20', '112', '31-Jan', '2-Feb', '1/16/2025', 'X', 'X', 'X', '', '2/10', 'Freeman', 'Brian', '', 'X', 'X', 'X', 'X', '', '', '-', '', '1/6', '', 'X', 'X', '', '', 'X', '', '', '', '', '', 'X', 'X', '', ''],
                ['ASA', 'QGenda', '2025', 'QGENDA 2025 ASA', 'Atlanta', '10x20', '207', '31-Jan', '2-Feb', '1/22/2024', 'X', 'X', 'X', '', '2/3', 'Freeman', 'ELITE', '', 'X', 'X', 'X', '', '', 'X', '', '1/10', '', 'X', 'X', '', '', 'X', '', '', '', '', '', 'X', 'X', '', ''],
                ['SCOPE', 'BestBuy Health', '2025', 'BESTBUY HEALTH 2025 SCOPE', 'Orlando, FL', '10x10', '429', '3-Feb', '5-Feb', '2/3/2025', 'X', 'X', 'X', '2/6', '2/6', 'Maxum', 'Top Shelf', '', 'X', 'X', 'X', 'X', '', '', 'X', '', '', 'X', 'X', '', 'X', 'X', '', '', '', '', '', 'X', '', '', ''],
                ['SCOPE', 'Deep6', '2025', 'DEEP6 2025 SCOPE', 'Orlando, FL', '10x20', '1121', '3-Feb', '5-Feb', '2/3/2025', 'N/A', 'N/A', 'X', '', 'x', 'Maxum', '', '', 'X', 'X', 'X', 'X', '', '', '-', '', '', 'X', 'X', '', 'X', 'X', '', '', '', '', '', 'X', '', '22-Dec', ''],
                ['MDM-West', 'Dymax', '2025', 'DYMAX 2025 MDM-WEST', 'Anaheim, CA', '20x30', '2101', '4-Feb', '7-Feb', '1/17/2025', 'X', 'X', 'X', '', '2/17', 'Freeman', 'ELITE', '', 'X', 'X', 'X', 'X', '', '', 'X', '', '12/1', '', 'X', 'X', '', '', 'X', '', '', '', '', '', 'X', 'X', '24-Dec', ''],
                ['TANDEM', 'BestBuy Health', '2025', 'BESTBUY HEALTH 2025 TANDEM', 'Honolulu, HI', '10x10', '633', '12-Feb', '15-Feb', '1/10/2025', 'X', 'X', 'X', '', '', 'Freeman', 'GC', '', 'X', 'X', 'X', 'X', '', '', '-', '', '', 'X', '', '', 'X', '', '', '', '', '', 'X', '', '', '', ''],
                ['RISE MMS', 'BestBuy Health', '2025', 'BESTBUY HEALTH 2025 RISE MMS', 'San Juan, PR', '10x10', '', '24-Feb', '26-Feb', '2/10/2025', 'X', 'X', 'X', '', '3/5', 'IMS', 'Local', '', 'X', 'X', 'X', 'X', '', '', 'X', '', '', 'X', '', '', 'X', '', '', '', '', '', '', '', '', '', ''],
                ['eTail West', 'Monetate', '2025', 'MONETATE 2025 ETAIL WEST', 'Palm Springs, CA', '10x10', '614', '24-Feb', '27-Feb', '2/10/2025', 'X', 'X', 'X', '', '3/10', 'Alliance', 'ELITE', '', 'X', 'X', 'X', 'X', '', '', 'X', '', '2/3', '', '', 'X', '', '', 'X', 'X', '', '', '', 'X', '', '', '13-Jan', ''],
                ['KBIS', 'Cyncly', '2025', 'CYNCLY 2025 KBIS', 'Las Vegas', '20x50', 'N2013', '25-Feb', '27-Feb', '2/14/2025', 'X', 'X', 'X', '', '3/5', 'Freeman', 'Brian', '', 'X', 'X', 'X', '', 'X', 'X', 'X', '', '1/10', '2/12', 'X', 'X', '', 'X', 'X', 'X', 'X', 'X', 'X', '', 'X', 'X', '13-Jan', ''],
                ['NAFEM', 'Marmon', '2025', 'MARMON 2025 NAFEM', 'Atlanta, GA', '30x30', '5754', '26-Feb', '28-Feb', '2/21/2025', 'X', 'X', 'X', '', '3/3', 'Freeman', 'Ben', '', 'X', 'X', 'X', 'X', 'X', 'X', 'X', '', '2/1', '', 'X', 'X', '', 'X', 'X', '', 'X', '', '', 'X', 'X', 'X', '14-Jan', ''],
                ['HIMSS', 'Codametrix', '2025', 'CODAMETRIX 2025 HIMSS', 'Las Vegas, NV', '20x20', '4657', '4-Mar', '6-Mar', '2/25/2025', 'X', 'X', 'X', '', '3/11', 'Freeman', 'Brian', '', 'X', 'X', 'X', 'X', '', '', 'X', '', '', 'X', 'X', '', 'X', 'X', 'X', 'X', 'X', '', 'X', '', '', '', ''],
                ['HIMSS', 'Harmony Health', '2025', 'HARMONY HEALTH 2025 HIMSS', 'Las Vegas, NV', '10x20', '2748', '4-Mar', '6-Mar', '2/25/2025', 'X', 'X', 'X', '', '3/11', 'Freeman', 'Brian', '', 'X', 'X', 'X', 'X', '', '', 'X', '', '2/7', '2/23', 'X', 'X', '', 'X', 'X', '', '', '', '', '', 'X', '', '', ''],
                ['HIMSS', 'QGenda', '2025', 'QGENDA 2025 HIMSS', 'Las Vegas, NV', '20x20', '5222', '4-Mar', '6-Mar', '2/25/2025', 'X', 'X', 'X', '', '3/11', 'Freeman', 'Brian', '', 'X', 'X', 'X', '', '', 'X', 'X', '', '2/1', '2/20', 'X', 'X', '', 'X', 'X', 'X', 'X', 'X', 'X', '', 'X', '', '', ''],
                ['SIA Forum', 'Tracker', '2025', 'TRACKER 2025 SIA FORUM', 'Miami Beach', '10x10', '412', '10-Mar', '13-Mar', '3/5/2025', 'X', 'N/A', 'X', '', '3/19', 'GES', 'ELITE', '', 'X', 'X', 'X', 'X', '', '', 'X', '', '', 'X', 'X', '', '', 'X', '', '', '', '', '', 'X', 'X', '', ''],
                ['IPC APEX (OSC)', 'Dymax', '2025', 'DYMAX 2025 IPC APEX OSC', 'Anaheim, CA', '10x10', '2305', '16-Mar', '18-Mar', '2/28/2025', 'X', 'X', 'X', '', '3/31', 'Shepard', 'Client', '', 'N/A', 'N/A', 'X', 'X', '', '', '-', '', '2/7', '', 'X', '', '', '', 'X', '', '', '', 'X', 'N/a', '', '', '', ''],
                ['D2P', 'Dymax (ECT)', '2025', 'DYMAX 2025 D2P', 'Orlando, FL', '10x10', '418', '11-Mar', '12-Mar', '3/6/2025', 'X', 'X', 'X', '', '3/7', '', '', '', 'N/A', 'N/A', 'N/A', 'N/A', '', '', '-', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
                ['RISE National', 'BestBuy Health', '2025', 'BESTBUY HEALTH 2025 RISE NATIONAL', 'San Antonio, TX', '10x10', '816', '12-Mar', '14-Mar', '3/7/2025', 'X', 'X', '', '', '3/17', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
                ['MHA', 'Softwriters', '2025', 'SOFTWRITERS 2025 MHA', 'Orlando, FL', '20x20', '519', '17-Mar', '18-Mar', '3/10/2025', 'X', 'X', '', '', '3/20', 'Heritage', 'Top Shelf', '', 'X', 'X', 'X', 'X', '', '', 'X', '', '2/28', '', 'X', 'X', '', '', 'X', '', 'N/a', '', '', '', '', '', '', ''],
                ['ShopTalk', 'Tulip', '2025', 'TULIP 2025 SHOPTALK', 'Las Vegas, NV', '10x10', '752', '25-Mar', '27-Mar', '3/19/2025', 'X', 'X', '', '', '3/31', 'Freeman', 'Brian', '', 'X', 'X', 'X', '', '', 'X', '', '3/1', '3/13', '', 'X', '', '', 'X', '-', 'N/a', '-', '-', '', 'X', 'X', '11-Feb', ''],
                ['ShopTalk', 'Kibo', '2025', 'KIBO 2025 SHOPTALK', 'Las Vegas, NV', '10x20', '2156', '25-Mar', '27-Mar', '3/19/2025', 'X', 'X', '', '', '3/31', 'Freeman', 'Brian', '', 'X', 'X', 'X', '', 'X', 'X', 'X', '', '3/1', '3/17', '', 'X', '', '', 'X', '-', 'N/a', '-', 'X', '', 'X', 'X', '11-Feb', 'X']
            ],
            'Clients': [
                ['Clients', 'Abbreviations', 'Notes'],
                ['ABCAM', '', ''],
                ['AHLSTROM', '', ''],
                ['ALLEN ARMS', '', ''],
                ['AMENTUM', '', ''],
                ['ASP', '', ''],
                ['ATSC', '', ''],
                ['AUSTAL', '', ''],
                ['AWNINC', 'AWN', ''],
                ['BECKMAN-COULTER', '', ''],
                ['BESTBUY HEALTH', 'BB HEALTH, BEST BUY', ''],
                ['BITBIO', '', ''],
                ['CARTA HEALTHCARE', '', ''],
                ['CERENCE', '', ''],
                ['CODAMETRIX', '', ''],
                ['CODEMETTLE', '', ''],
                ['CYNCLY', '', ''],
                ['DANAHER', '', ''],
                ['DAVIDSONS', '', ''],
                ['DEEP6', '', ''],
                ['DGS', '', ''],
                ['DYMAX', 'DYMAX ECT, DYMAX BOMAR', ''],
                ['E4', '', ''],
                ['ECOLAB', '', ''],
                ['ECS', '', ''],
                ['F365 NEXTGEN', '', ''],
                ['FIREMON', '', ''],
                ['FUNERAL365', '', ''],
                ['GEARFIRE', '', ''],
                ['GROUPERA', '', ''],
                ['GUERBET', '', ''],
                ['GUNSTORES', 'GUNSTORESCOM', ''],
                ['HARMONY HEALTH', '', ''],
                ['IMPERIAL CS', '', ''],
                ['INSIDER', '', ''],
                ['KIBO', '', ''],
                ['KYRUUS', '', ''],
                ['LEICA', '', ''],
                ['MARMON', '', ''],
                ['MARUKA USA', 'MARUKA', ''],
                ['MICROSOFT', '', ''],
                ['MOJO', 'MOJO OUTDOORS', ''],
                ['MONETATE', '', ''],
                ['MOZAIK', '', ''],
                ['NUANCE', '', ''],
                ['PACIFIC SOLUTIONS', '', ''],
                ['PAYACTIV', '', ''],
                ['PIXELFLEX', '', ''],
                ['PRECISION OT', 'PREC OT', ''],
                ['PRET', '', ''],
                ['QGENDA', '', ''],
                ['SERTIFI', '', ''],
                ['SOAR TECH', '', ''],
                ['SOFTWRITERS', '', ''],
                ['STANLEY SPORTS', '', ''],
                ['STENO', '', ''],
                ['SWISHER', '', ''],
                ['TITAN TV', '', ''],
                ['TRACKER', '', ''],
                ['TRIVENI', '', ''],
                ['TUFIN', '', ''],
                ['TULIP', '', ''],
                ['UCF', '', ''],
                ['VISMEC', '', ''],
                ['VUZIX', '', ''],
                ['WORKLIO', '', '']
            ],
            'Shows': [
                ['Shows', 'Abbreviations', 'Notes'],
                ['AACR', '', ''],
                ['AANA', '', ''],
                ['AAOS', '', ''],
                ['AAP', '', ''],
                ['ABA', '', ''],
                ['ABATECH', '', ''],
                ['ABBEY & FLOORS TO GO', '', ''],
                ['ACC-QS', 'ACC', ''],
                ['ACDIS', '', ''],
                ['ACEP', '', ''],
                ['AHIMA', '', ''],
                ['AHIP', '', ''],
                ['AHRA', '', ''],
                ['ALLIANCE FLOORING', '', ''],
                ['ALS DRUG DEV', '', ''],
                ['ALZHEIMERS & DD', '', ''],
                ['AMGA', '', ''],
                ['ANCC', '', ''],
                ['ANESTHESIOLOGY', '', ''],
                ['AONL', '', ''],
                ['AORN', '', ''],
                ['ARRS', '', ''],
                ['ASA', '', ''],
                ['ASA ADVANCE', '', ''],
                ['ASC-BECKERS', '', ''],
                ['ASCA', '', ''],
                ['ASCO', '', ''],
                ['ASCP', '', ''],
                ['ASGCT', '', ''],
                ['ASH', '', ''],
                ['ASHHRA', '', ''],
                ['ASPNR', '', ''],
                ['ATA', '', ''],
                ['ATRIUM HEALTH', '', ''],
                ['AUA', '', ''],
                ['AUSA', '', ''],
                ['AUSTAL USA', '', ''],
                ['AWFS', '', ''],
                ['BECKERS', '', ''],
                ['BECKERS HIT', '', ''],
                ['BECKERS HOSPITAL REVIEW', 'BECKERS HR', ''],
                ['BECKERS CEO CFO', '', ''],
                ['BIO', '', ''],
                ['BURGER KING NA', 'BK', ''],
                ['CABLE-TEC', '', ''],
                ['CABLE-TEC SCTE', '', ''],
                ['CARDINAL RBC', '', ''],
                ['CARLS JR SFA', '', ''],
                ['CCA-WINTER', '', ''],
                ['CERNER', '', ''],
                ['CES', '', ''],
                ['CHENEY BROS', '', ''],
                ['CISCOLIVE', '', ''],
                ['CONNECTED AMER', '', ''],
                ['COVERINGS', '', ''],
                ['CUSTOMER EVENT', '', ''],
                ['CUSTOMER SUMMIT', '', ''],
                ['D2P', '', ''],
                ['DHI', '', ''],
                ['DIA', '', ''],
                ['DISCOVERY US', '', ''],
                ['ECOLAB', '', ''],
                ['EMERGE AMERICA', 'EMERGE AM', ''],
                ['ENA', '', ''],
                ['EPIC UGM', '', ''],
                ['EPIC XGM', '', ''],
                ['ETAIL EAST', '', ''],
                ['ETAIL WEST', '', ''],
                ['EURONAVAL', '', ''],
                ['EXECUTIVE FORUM', '', ''],
                ['FESTIVAL', '', ''],
                ['FIBERCONNECT', '', ''],
                ['FIELD SUMMIT', '', ''],
                ['FMX', '', ''],
                ['FUSE', '', ''],
                ['GERIMED', '', ''],
                ['GEST', '', ''],
                ['GLASSBUILD', '', ''],
                ['HEALTHTRUST', '', ''],
                ['HFMA ANNUAL', '', ''],
                ['HFMA WESTERN', '', ''],
                ['HFMA-REG2', '', ''],
                ['HIMSS', '', ''],
                ['HITEC', '', ''],
                ['HLTH', '', ''],
                ['HOSPITALITY SHOW', '', ''],
                ['HR TECH', '', ''],
                ['HSPA', '', ''],
                ['HTU', '', ''],
                ['IITSEC', 'ITSEC', ''],
                ['IACP', '', ''],
                ['ICAST', '', ''],
                ['ICCFA', '', ''],
                ['IHFA HARDEES', '', ''],
                ['ILTACON', '', ''],
                ['INFOCOMM', '', ''],
                ['INFOCUS', '', ''],
                ['IPC APEX OSC', '', ''],
                ['ISE EXPO', '', ''],
                ['IWF', '', ''],
                ['KBIS', 'KBIZ', ''],
                ['LEGALWEEK', '', ''],
                ['MAYO CLINIC', '', ''],
                ['MCDONALDS CANADA', 'MCD CANADA', ''],
                ['MCDONALDS WORLDWIDE', 'MCDONALDS WW, MCD WW', ''],
                ['MDM-WEST', 'MDM W', ''],
                ['MEDICARAINS', '', ''],
                ['MGMA', '', ''],
                ['MGMA LEADERS', '', ''],
                ['MHA', '', ''],
                ['MOHAWK EDGE', 'MOHAWK', ''],
                ['MWC', '', ''],
                ['MWC-BARCELONA', 'MWC B', ''],
                ['NAB', '', ''],
                ['NACDS', '', ''],
                ['NADA', '', ''],
                ['NAFEM', '', ''],
                ['NAMSS', '', ''],
                ['NCPA', '', ''],
                ['NEOCON', '', ''],
                ['NEUROSCIENCE', '', ''],
                ['NFDA', '', ''],
                ['NOA', '', ''],
                ['NPE', '', ''],
                ['NRF', '', ''],
                ['OCHIN', '', ''],
                ['OCT SOCAL', '', ''],
                ['OCT WEST', '', ''],
                ['OCT-NEW ENG', '', ''],
                ['OFC', '', ''],
                ['OR MANAGER', '', ''],
                ['ORACLE BLUEPRINT', '', ''],
                ['ORACLE INFOCUS', '', ''],
                ['ORMC', '', ''],
                ['PGA', '', ''],
                ['POPEYES', '', ''],
                ['PREMIER BREAKTHROUGHS', '', ''],
                ['RADTECH', '', ''],
                ['RANGE RETAILER', '', ''],
                ['RISE MMS', '', ''],
                ['RISE NATIONAL', '', ''],
                ['RSA', '', ''],
                ['RSNA', '', ''],
                ['RTM HEALTHCARE', '', ''],
                ['SCOPE', '', ''],
                ['SEA AIR SPACE', 'SAS', ''],
                ['SEAT', '', ''],
                ['SFN', '', ''],
                ['SGNA', '', ''],
                ['SHOPTALK', '', ''],
                ['SHOPTALK FALL', 'SHOPTALK F', ''],
                ['SHOT', 'SHOT SHOW', ''],
                ['SIA FORUM', '', ''],
                ['SIIM', '', ''],
                ['SIO', '', ''],
                ['SIR', '', ''],
                ['SITC', '', ''],
                ['SLAS', '', ''],
                ['SMTA', '', ''],
                ['SMTA INTL', '', ''],
                ['SONIC', '', ''],
                ['SOUTHEAST FLOORING MARKET', '', ''],
                ['SOUTHWEST FLOORING', '', ''],
                ['STAFFING WORLD', '', ''],
                ['SURFACE NAVY', 'SNA', ''],
                ['SURFACES', 'SURFACES TISE', ''],
                ['SWFM', '', ''],
                ['SYNBIOBETA', '', ''],
                ['TANDEM', '', ''],
                ['TIM HORTON\'S', '', ''],
                ['USER CONFERENCE', '', ''],
                ['WAW REWARDS', '', ''],
                ['WENDYS', '', ''],
                ['WON', '', ''],
                ['WOODPRO', 'WOODPRO EXPO', ''],
                ['WORKBOAT', '', ''],
                ['XPONENTIAL', '', '']
            ]
        },
        'CACHE': {
            'CacheData': [
                ['Key', 'Value', 'Timestamp'],
                ['last_sync', '2025-07-10T10:30:00Z', '1720606200000'],
                ['inventory_count', '475', '1720606200000']
            ]
        }
    };

    static mockTabs = {
        'INVENTORY': [
            { title: 'Sheet1', sheetId: 0 },
            { title: 'Archive', sheetId: 1 },
            { title: 'Temp_Sheet_1', sheetId: 2 }
        ],
        'PACK_LISTS': [
            { title: 'Current', sheetId: 0 },
            { title: 'TEMPLATE', sheetId: 1 },
            { title: 'ATSC 2025 NAB', sheetId: 2 }
        ],
        'PROD_SCHED': [
            { title: 'Schedule', sheetId: 0 },
            { title: 'Completed', sheetId: 1 },
            { title: 'Clients', sheetId: 2 },
            { title: 'Shows', sheetId: 3 }
        ],
        'CACHE': [
            { title: 'CacheData', sheetId: 0 }
        ]
    };

    static async withExponentialBackoff(fn, maxRetries = 7, initialDelay = 500) {
        console.log('FakeGoogleSheetsService: Simulating exponential backoff...');
        await this.delay(Math.random() * 100 + 50); // Random delay between 50-150ms
        try {
            return await fn();
        } catch (error) {
            console.log('FakeGoogleSheetsService: Simulated error caught in backoff');
            throw error;
        }
    }

    static async getSheetData(tableId, range) {
        await FakeGoogleSheetsAuth.checkAuth();
        
        const spreadsheetId = this.SPREADSHEET_IDS[tableId];
        if (!spreadsheetId) throw new Error(`Spreadsheet ID not found for table: ${tableId}`);

        console.log(`FakeGoogleSheetsService: Getting data for ${tableId}, range: ${range}`);
        await this.delay(100);

        // Parse range to extract sheet name
        const [sheetName] = range.split('!');
        const sheetData = this.mockData[tableId] && this.mockData[tableId][sheetName];
        
        if (!sheetData) {
            console.warn(`FakeGoogleSheetsService: No mock data found for ${tableId}/${sheetName}`);
            return [[]];
        }

        // Return a copy to avoid mutation
        return JSON.parse(JSON.stringify(sheetData));
    }

    static async setSheetData(tableId, tabName, updates) {
        await FakeGoogleSheetsAuth.checkAuth();

        const spreadsheetId = this.SPREADSHEET_IDS[tableId];
        if (!spreadsheetId) throw new Error(`Spreadsheet ID not found for table: ${tableId}`);

        console.log(`FakeGoogleSheetsService: Setting data for ${tableId}/${tabName}`);
        await this.delay(150);

        try {
            // Handle cell-by-cell updates
            if (Array.isArray(updates)) {
                console.log(`FakeGoogleSheetsService: Applying ${updates.length} cell updates`);
                
                // Ensure the sheet exists in mock data
                if (!this.mockData[tableId]) this.mockData[tableId] = {};
                if (!this.mockData[tableId][tabName]) this.mockData[tableId][tabName] = [[]];

                const sheetData = this.mockData[tableId][tabName];
                
                updates.forEach(({row, col, value}) => {
                    // Expand sheet if necessary
                    while (sheetData.length <= row) {
                        sheetData.push([]);
                    }
                    while (sheetData[row].length <= col) {
                        sheetData[row].push('');
                    }
                    sheetData[row][col] = value;
                });
                
                return true;
            }
            
            // Handle full-table updates
            if (updates?.type === 'full-table' && Array.isArray(updates.values)) {
                console.log(`FakeGoogleSheetsService: Full table update with ${updates.values.length} rows`);
                
                // Ensure the sheet exists in mock data
                if (!this.mockData[tableId]) this.mockData[tableId] = {};
                
                // Replace the entire sheet data
                this.mockData[tableId][tabName] = JSON.parse(JSON.stringify(updates.values));
                
                return true;
            }
            
            throw new Error('Invalid updates format for setSheetData');
        } catch (error) {
            console.error('FakeGoogleSheetsService: Error updating sheet:', error);
            throw error;
        }
    }

    static async getSheetTabs(tableId) {
        await FakeGoogleSheetsAuth.checkAuth();

        const spreadsheetId = this.SPREADSHEET_IDS[tableId];
        if (!spreadsheetId) throw new Error(`Spreadsheet ID not found for table: ${tableId}`);
        
        console.log(`FakeGoogleSheetsService: Getting tabs for ${tableId}`);
        await this.delay(80);

        const tabs = this.mockTabs[tableId] || [];
        return JSON.parse(JSON.stringify(tabs)); // Return a copy
    }

    static async hideTabs(tableId, tabs) {
        await FakeGoogleSheetsAuth.checkAuth();

        const spreadsheetId = this.SPREADSHEET_IDS[tableId];
        if (!spreadsheetId) throw new Error(`Spreadsheet ID not found for table: ${tableId}`);

        console.log(`FakeGoogleSheetsService: Hiding ${tabs.length} tabs in ${tableId}`);
        await this.delay(120);

        // In a real implementation, we'd track hidden state
        // For mock purposes, just log the action
        tabs.forEach(tab => {
            console.log(`  - Hiding tab: ${tab.title} (ID: ${tab.sheetId})`);
        });
    }

    static async showTabs(tableId, tabs) {
        await FakeGoogleSheetsAuth.checkAuth();

        const spreadsheetId = this.SPREADSHEET_IDS[tableId];
        if (!spreadsheetId) throw new Error(`Spreadsheet ID not found for table: ${tableId}`);

        console.log(`FakeGoogleSheetsService: Showing ${tabs.length} tabs in ${tableId}`);
        await this.delay(120);

        // In a real implementation, we'd track hidden state
        // For mock purposes, just log the action
        tabs.forEach(tab => {
            console.log(`  - Showing tab: ${tab.title} (ID: ${tab.sheetId})`);
        });
    }

    static async copySheetTab(tableId, sourceTab, newTabName) {
        await FakeGoogleSheetsAuth.checkAuth();

        const spreadsheetId = this.SPREADSHEET_IDS[tableId];
        if (!spreadsheetId) throw new Error(`Spreadsheet ID not found for table: ${tableId}`);

        console.log(`FakeGoogleSheetsService: Copying tab ${sourceTab.title} to ${newTabName} in ${tableId}`);
        await this.delay(200);

        // Simulate copying by creating new tab data
        if (this.mockData[tableId] && this.mockData[tableId][sourceTab.title]) {
            this.mockData[tableId][newTabName] = JSON.parse(JSON.stringify(this.mockData[tableId][sourceTab.title]));
        }

        // Add new tab to tabs list
        if (this.mockTabs[tableId]) {
            const newSheetId = Math.max(...this.mockTabs[tableId].map(t => t.sheetId)) + 1;
            this.mockTabs[tableId].push({
                title: newTabName,
                sheetId: newSheetId
            });
        }

        console.log(`FakeGoogleSheetsService: Successfully copied tab to ${newTabName}`);
    }

    static async querySheetData(tableId, query) {
        await FakeGoogleSheetsAuth.checkAuth();
        
        console.log(`FakeGoogleSheetsService: Executing query on ${tableId}: ${query}`);
        await this.delay(100);

        try {
            // Parse the query using SheetSql like the real implementation
            const parsedQuery = SheetSql.parseQuery(query);
            
            if (!parsedQuery.from) {
                throw new Error('Invalid query: FROM clause is required');
            }
            
            // Get the data from the sheet
            const data = await this.getSheetData(tableId, parsedQuery.from);
            
            if (!data || data.length === 0) {
                return [];
            }
            
            // Execute the query against the data using SheetSql
            const results = SheetSql.executeQuery(parsedQuery, data);
            
            console.log(`FakeGoogleSheetsService: Query returned ${results.length} results`);
            return results;
        } catch (error) {
            console.error('FakeGoogleSheetsService: Error executing sheet query:', error);
            throw new Error(`Failed to execute query: ${error.message}`);
        }
    }

    // Utility method to simulate async delays
    static delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Method to reset mock data to original state (useful for testing)
    static resetMockData() {
        console.log('FakeGoogleSheetsService: Resetting mock data to original state');
        // This would restore the original mockData structure
        // Implementation left as exercise since it depends on specific testing needs
    }

    // Method to add custom mock data for testing
    static setMockData(tableId, sheetName, data) {
        console.log(`FakeGoogleSheetsService: Setting custom mock data for ${tableId}/${sheetName}`);
        if (!this.mockData[tableId]) this.mockData[tableId] = {};
        this.mockData[tableId][sheetName] = JSON.parse(JSON.stringify(data));
    }

    // Method to get current mock data (useful for debugging tests)
    static getMockData(tableId, sheetName = null) {
        if (sheetName) {
            return this.mockData[tableId] && this.mockData[tableId][sheetName] 
                ? JSON.parse(JSON.stringify(this.mockData[tableId][sheetName]))
                : null;
        }
        return this.mockData[tableId] 
            ? JSON.parse(JSON.stringify(this.mockData[tableId]))
            : null;
    }
}

// Export both classes for easy swapping with real implementations
export { FakeGoogleSheetsAuth as GoogleSheetsAuth, FakeGoogleSheetsService as GoogleSheetsService };
