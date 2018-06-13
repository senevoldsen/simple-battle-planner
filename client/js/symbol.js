
export class CodeMap {
    constructor() {
        this._codes = Object.create(null);
        this._texts = Object.create(null);
    }

    add(text, code) {
        this._codes[code] = text;
        this._texts[text] = code;
    }

    getCode(text) {
        return this._texts[text];
    }

    getText(text) {
        return this._codes[text];
    }

    get codes() {
        return Object.keys(this._codes);
    }

    get texts() {
        return Object.keys(this._texts);
    }

    get entries() {
        return Object.entries(this._codes);
    }
}

// Common / Set A
export const VERSION = new CodeMap();
export const CONTEXT = new CodeMap();
export const IDENTITY = new CodeMap();
export const SYMBOL_SET = new CodeMap();
export const STATUS = new CodeMap();
export const HQ_TF_DUMMY = new CodeMap();

// Land Units
export const LAND_UNIT_ECHELON = new CodeMap();
export const LAND_UNIT_ENTITY = new CodeMap();
export const LAND_UNITS_MODIFIER_1 = new CodeMap();
export const LAND_UNITS_MODIFIER_2 = new CodeMap();

// Land Equipment
export const LAND_EQUIPMENT_ECHELON = new CodeMap();

export class SymbolCode {
    constructor(sidc) {
        this.sidc = sidc || '10011000000000000000';
    }

    static fromDescription(description) {
        // Set A
        const version = VERSION.getCode(description.version || 'No Change');
        const context = CONTEXT.getCode(description.context || 'Reality');
        const identity = IDENTITY.getCode(description.affiliation || description.identity || 'Unknown');
        const symbolSet = SYMBOL_SET.getCode(description.type || 'Land Unit');
        const status = STATUS.getCode(description.status || 'Present');
        const hq_tf_dummy = HQ_TF_DUMMY.getCode(description.hq_tf_dummy || 'Not Applicable');
        const echelon = LAND_UNIT_ECHELON.getCode(description.echelon || 'Unspecified')
        // Set B
        const entity = LAND_UNIT_ENTITY.getCode(description.entity || 'Unspecified');
        const modifier1 = LAND_UNITS_MODIFIER_1.getCode(description.modifier1 || 'Unspecified');
        const modifier2 = LAND_UNITS_MODIFIER_1.getCode(description.modifier2 || 'Unspecified');
        const sidc = version + context + identity + symbolSet + status + hq_tf_dummy + echelon + entity + modifier1 + modifier2;
        return new SymbolCode(sidc);
    }

    get code() {
        return this.sidc;
    }

    toString() {
        return this.code;
    }

    getDescription() {
        const code = this.sidc;
        return {
            // Set A
            version: VERSION.getText(code.slice(0, 2)),
            context: CONTEXT.getText(code.slice(2, 3)),
            identity: IDENTITY.getText(code.slice(3, 4)),
            // Alternative name for identity
            affiliation: IDENTITY.getText(code.slice(3, 4)),
            type: SYMBOL_SET.getText(code.slice(4, 6)),
            status: STATUS.getText(code.slice(6, 7)),
            hq_tf_dummy: HQ_TF_DUMMY.getText(code.slice(7, 8)),
            echelon: LAND_UNIT_ECHELON.getText(code.slice(8, 10)),
            // Set B
            entity: LAND_UNIT_ENTITY.getText(code.slice(10, 16)),
            modifier1: LAND_UNITS_MODIFIER_1.getText(code.slice(16, 18)),
            modifier2: LAND_UNITS_MODIFIER_2.getText(code.slice(18, 20))
        }
    }
}


/* Python extract from PDF
matches = re.findall(r'\s*(\D+)\s*(\d+)\s*', text)
matches = [(re.sub(r'\n', '', t.strip()), n) for t, n in matches]
matches = [(re.sub(r'[\s-]+', '_', t), n) for t, n in matches]

print(',\n'.join("'%s': '%s'" % (key.upper(), num) for key, num in matches))
*/


/* --------------- Set A
    The first set of ten digits:  

    Digits 1 and 2 is the Version.   
    Digits 3 and 4 is the Standard Identity.  
    Digits 5 and 6 is the Symbol Set.   
    Digit 7 is the Status.   
    Digit 8 is the Headquarters/Task Force/Dummy.  
    Digits 9 and 10 is the Amplifier/Descriptor
*/

Object.entries({
      'No Change': '10'
}).forEach(([text, code]) => VERSION.add(text, code));

Object.entries({
      'Reality': '0'
}).forEach(([text, code]) => CONTEXT.add(text, code));

Object.entries({
      'Pending': '0'
    , 'Unknown': '1'
    , 'Assumed Friend': '2'
    , 'Friend': '3'
    , 'Neutral': '4'
    , 'Suspect': '5'
    , 'Hostile': '6'
}).forEach(([text, code]) => IDENTITY.add(text, code));

// Symbol set
Object.entries({
    'Land Unit': '10'
}).forEach(([text, code]) => SYMBOL_SET.add(text, code));

Object.entries({
      'Present': '0'
    , 'Planned/Anticipated/Suspect': '1'
    , 'Present/Fully Capable': '2'
    , 'Present/Damaged': '3'
    , 'Present/Destroyed': '4'
    , 'Present/Full to capacity': '5'
}).forEach(([text, code]) => STATUS.add(text, code));

// Headquarters/Task Force/Dummy
Object.entries({
      'Not Applicable': '0'
    , 'Feint/Dummy': '1'
    , 'Headquarters': '2'
    , 'Feint/Dummy Headquarters': '3'
    , 'Task Force': '4'
    , 'Feint/Dummy Task Force': '5'
    , 'Task Force Headquarters': '6'
    , 'Feint/Dummy Fask Force Headquarters': '7'
}).forEach(([text, code]) => HQ_TF_DUMMY.add(text, code));

// Echelon / Mobility / Towed array
Object.entries({
      'Unspecified': '00'
    // Brigade and below
    , 'Team/Crew': '11'
    , 'Squad': '12'
    , 'Section': '13'
    , 'Platoon/Detachment': '14'
    , 'Company/Battery/Troop': '15'
    , 'Battalion/Squadron': '16'
    , 'Regiment/Group': '17'
    , 'Brigade': '18'
    // Division and above
    , 'Division': '21'
    , 'Corps/Mef': '22'
    , 'Army': '23'
    , 'Army Group/Front': '24'
    , 'Region/Theater': '25'
    , 'Command': '26'
}).forEach(([text, code]) => LAND_UNIT_ECHELON.add(text, code));

Object.entries({
    // Land mobility
      'Wheeled Limited Cross Country': '31'
    , 'Wheeled Cross Country': '32'
    , 'Tracked': '33'
    , 'Wheeled and Tracked Combination': '34'
}).forEach(([text, code]) => LAND_EQUIPMENT_ECHELON.add(text, code));

/* --------------- Set B

    The second set of ten digits:

    Digits 11 and 12 is the entity.
    Digits 13 and 14 is the entity type.
    Digits 15 and 16 is the entity subtype.
    Digits 17 and 18 is the first modifier.
    Digits 19 and 20 is the second modifier.
*/
Object.entries({
      'Unspecified': '000000'
    , 'Infantry': '121100'
    , 'Infantry - Motorized': '121104'
    , 'Infantry - Mechanized': '121102'
    , 'Recon/Cavalry': '121300'
    , 'Antitank': '120400'
    , 'Armoured': '120500'
    , 'Artillery': '130300'
    , 'Artillery - Self-Propelled': '130301'
    , 'Air Defence': '130100'
}).forEach(([text, code]) => LAND_UNIT_ENTITY.add(text, code));

Object.entries({
      'Unspecified': '00'
    , 'Air Mobile/Assault': '01'
    , 'Bridging': '06'
    , 'Command and Control': '10'
}).forEach(([text, code]) => LAND_UNITS_MODIFIER_1.add(text, code));

Object.entries({
      'Unspecified': '00'
    , 'Airborne': '01'
    , 'Arctic': '02'
    , 'Bicycle Equipped': '04'
    , 'Mountain': '27'
}).forEach(([text, code]) => LAND_UNITS_MODIFIER_2.add(text, code));
