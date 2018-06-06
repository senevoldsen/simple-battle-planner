import * as symbol from './symbol.js';
import * as bpleaf from './leaflet/movesegment.js';
import * as guiOrder from './gui.order.js';


export class GuiObject {
    constructor(oid) {
        this.oid = oid;
    
    }
    serialize() {
        throw Error('serialize must be overridden');
    }

    static deserialize(json) {
        throw Error('deserialize must be overridden');
    }

    // Restore current state to map
    updateGui() {
        throw Error('updateGui must be overridden');
    }
    // Remove object from map
    removeFromGui() {
        throw Error('removeFromGui must be overridden');
    }
}

export class Unit extends GuiObject {

    constructor(oid, identifier) {
        super(oid);
        this.identifier = identifier;
        this.pos = [0, 0];
        this.isDraggable = false;
        this._guiState = {};
        this._orders = [];
        // Optionally set elsewhere
        this.options = {};
    }

    serialize(encoder) {
        encoder.store('oid', this.oid);
        encoder.store('identifier', this.identifier);
        encoder.store('pos', this.pos);
        encoder.store('isDraggable', this.isDraggable);
        encoder.store('orders', this._orders);
        if (this.options) {
            encoder.store('options', this.options);
        }
    }

    static deserialize(decoder) {
        const oid = decoder.get('oid');
        const identifier = decoder.get('identifier');
        const result = new Unit(oid, identifier);
        result.pos = decoder.get('pos', result.pos);
        result.isDraggable = decoder.get('isDraggable', result.isDraggable);
        result._orders = decoder.get('orders', []);
        result.options = decoder.get('options', {});
        return result;
    }

    addOrder(order) {
        this._orders.push(order);
    }

    removeOrder(order) {
        const index = this._orders.indexOf(order);
        if (index > -1) {
            this._orders.splice(index, 1);
            order.removeFromGui();
        }
    }

    removeAllOrders() {
        this._orders.forEach(order => this.removeOrder(order));
    }

    get numberOfOrders() {
        return this._orders.length;
    }

    updateGui() {
        this.removeFromGui();
        this._updateOrderProperties();

        // Create marker
        const icon = getIconForUnit(this);

        const leafPos = L.latLng(G.bpMap.gameToMap(this.pos));
        const marker = L.marker(leafPos, {icon: icon, draggable: this.isDraggable});
        marker.addTo(G.markerLayer);
        
        marker.on('contextmenu', (event) => {
            onUnitContextMenu(this);
        });
        
        marker.on('moveend', (event) => {
            this.pos = G.bpMap.mapToGame(marker.getLatLng());
            markModified(this);
        });
        this._orders.forEach(order => order.updateGui());
        this._guiState.unitMarker = marker;
    }

    removeFromGui() {
        if (this._guiState.unitMarker) {
            G.markerLayer.removeLayer(this._guiState.unitMarker);
            this._guiState.unitMarker = null;
        }
        this._orders.forEach(order => order.removeFromGui());
    }

    getSideColor() {
        const _colors = {
              'Pending': 'yellow'
            , 'Unknown': 'yellow'
            , 'Assumed Friend': 'blue'
            , 'Friend': 'blue'
            , 'Neutral': 'green'
            , 'Suspect': 'red'
            , 'Hostile': 'red'
        };
        const code = new symbol.SymbolCode(this.identifier);
        const desc = code.getDescription();
        return _colors[desc.identity];
    }

    _updateOrderProperties() {
        // TODO: this should probably be refactored out later when more order types
        if (this._orders.length == 0) return;
        // If first order is move type update it's from position
        if (this._orders[0] instanceof guiOrder.MoveOrder) {
            this._orders[0].from = Array.from(this.pos);
        }
    }
}

function randomElem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

const objectState = Object.create(null);
var guiModifiedObjects = Object.create(null);
var guiModifyHandler = null;

export function getObjectId (prefix) {
    var unique = false;
    var oid = '';
    while (!unique) {
        oid = prefix + Math.random().toString(36).slice(2);
        unique = !(oid in objectState);
    }
    return oid;
};

export function getRandomUnit () {
    const description = getRandomUnitDescription();
    const symbolCode = symbol.SymbolCode.fromDescription(description).toString();
    return new Unit(getObjectId('unit.'), symbolCode);
};

export function getRandomUnitDescription () {
    const description = {
        affiliation: randomElem(['Friend', 'Hostile', 'Neutral']),
        type: 'Land Unit',
        status: 'Present',
        // Skip HQ/TF/Dummy
        echelon: randomElem(symbol.LAND_UNIT_ECHELON.entries.filter(([code, text]) => {
            const number = parseInt(code, 10);
            return number >= 12 && number <= 18;
        }))[1],
        entity: randomElem(symbol.LAND_UNIT_ENTITY.texts)
        // Skip modifiers
    };
    return description;
};

// Translate to milsymbol and retrieve
function getIconForUnit (unit) {
    const sidc = unit.identifier;
    const options = Object.assign({}, unit.options);
    Object.assign(options, {
        size: 35,
        infoSize: 50
    });
    const milSymbol = new ms.Symbol(sidc, options);
    const icon = L.divIcon({
        className: '',
        html: milSymbol.asSVG(),
        iconAnchor: new L.point(milSymbol.getAnchor().x, milSymbol.getAnchor().y)
    });
    return icon;
};

export function processState (state) {
    // Remove everything existing
    Object.keys(objectState).forEach((oid) => {
        processObject(oid, null);
    });
    // Recreate
    Object.keys(state).forEach((oid) => {
        const object = state[oid];
        processObject(object.oid, object);
    });
};

export function getTypeFromOid (oid) {
    return oid.split('.')[0];
};

/*
    Derives processing from object identifier (oid)
*/
export function processObject (oid, data) {
    const objectType = getTypeFromOid(oid);

    if (objectType !== 'unit') {
        console.log(`Unknown object type '${objectType}' for id '${oid}'`);
        return;
    }

    let existing = objectState[oid] || null;
    if (data == null) {
        if (existing) {
            existing.removeFromGui();
            delete objectState[oid];
        }
    } else {
        // TODO: optimize this better.
        if (existing) {
            existing.removeFromGui();
        }
        objectState[oid] = data;
        data.updateGui();
    }
};

export function getState () {
    // Warning: reference to real state
    return objectState;    
};

/*
    This function is used to collect all modifications to prevent sending redudant information
*/
export function markModified (object, sync) {
    // Store modification info
    const prevData = guiModifiedObjects[object.oid];
    const activeData = prevData || {syncLocal: false, syncRemote: false, object: object};
    sync = sync ? sync.toLowerCase() : 'global';
    if (sync === 'global') {
        activeData.syncLocal = true;
        activeData.syncRemote = true;
    } else if (sync === 'local') {
        activeData.syncLocal = true;
    } else if (sync === 'remote') {
        activeData.syncRemote = true;
    }
    guiModifiedObjects[object.oid]= activeData;

    // Queue handler
    if (guiModifyHandler === null) {
        guiModifyHandler = setTimeout(() => {
            // Process dirty list
            Object.values(guiModifiedObjects).forEach((data) => {
                if (data.syncRemote) {
                    G.events.trigger('gui.object.updated', [object]);
                }
                if (data.syncLocal) {
                    processObject(object.oid, object);    
                }
            });
            // Reset list
            guiModifiedObjects = Object.create(null);
            guiModifyHandler = null;
        }, 0);
    }
};

function constructMenu (options, onItemSelected) {
    const containerElem = document.createElement('div');
    containerElem.className = 'bp-contextmenu';
    // containerElem.style.minWidth = '400px';

    if (options.header) {
        const headerElem = document.createElement('h1');
        headerElem.className = 'header';
        headerElem.textContent = options.header;
        containerElem.appendChild(headerElem);    
    }

    options.menuItems.forEach((optionData) => {
        if (optionData instanceof Array) {
            const [text, action] = optionData;
            const elem = document.createElement('p');
            elem.textContent = text;
            elem.className = 'option';
            elem.addEventListener('click', () => {
                // Catch to ensure we close menu
                try {
                    action();
                } finally {
                    onItemSelected();    
                }
                
            });
            containerElem.appendChild(elem);
        } else {
            if (optionData.type === 'SEPARATOR') {
                const elem = document.createElement('hr');
                containerElem.appendChild(elem);
            } else if (optionData.type === 'HEADER') {
                const elem = document.createElement('p');
                elem.className = 'item-header';
                elem.textContent = optionData.text;
                containerElem.appendChild(elem);
            }
        }
    });

    return containerElem;
};

function getUnitMoveOrders (unit, callback) {
    const makeMoveOption = (moveType) => {
        return () => {
            const map = G.leafMap;
            const onClick = (e) => {
                map.off('click', onClick);
                const mapPos = e.latlng;
                const gamePos = G.bpMap.mapToGame(mapPos);
                const order = new guiOrder.MoveOrder(
                    unit.pos,
                    gamePos,
                    unit.getSideColor(),
                    moveType.toUpperCase()
                );
                callback(order);
            };
            map.on('click', onClick);
        };
    };
    const menuItems = [
        'March',
        'Advance',
        'Attack',
        'Withdraw'
    ].map(name => [name, makeMoveOption(name)]);
    return menuItems;
};

function onUnitContextMenu (unit) {
    const items = [
        ['Delete', () => {
            G.events.trigger('gui.object.deleted', [unit]);
            processObject(unit.oid, null);
        }]
        ,
        ['Modify Symbol', () => openModifyUnitMenu(unit)]
    ];

    if (unit.isDraggable) {
        items.push(['Disable Dragging', () => {
            unit.isDraggable = false;
            markModified(unit);
        }]);
    } else {
        items.push(['Enable Dragging', () => {
            unit.isDraggable = true;
            markModified(unit);
        }]);
    }

    items.push({type: 'SEPARATOR'});
    items.push({type: 'HEADER', text: 'Orders'});

    const onMoveSelectedCallback = order => {
        unit.addOrder(order);
        markModified(unit);
    };

    if (unit.numberOfOrders > 0) {
        items.push(['Remove Order', () => {
            unit.removeAllOrders();
            markModified(unit);
        }]);
    } else {
        getUnitMoveOrders(unit, onMoveSelectedCallback).forEach(menuItem => items.push(menuItem));
    }

    const map = G.leafMap;
    const mapPos = new L.latLng(G.bpMap.gameToMap(unit.pos));
    const popup = L.popup({minWidth: 200, maxWidth: 600});
    
    const menuElem = constructMenu({
        menuItems: items,
        header: 'Unit Menu'
    }, () => map.closePopup());

    popup.setLatLng(mapPos)
        .setContent(menuElem)
        .openOn(map);
};

function onMapContextMenu (mapPos) {
    const items = [
        ['Create Unit', () => {
            const unit = getRandomUnit();
            unit.pos = G.bpMap.mapToGame(mapPos);
            G.events.trigger('gui.object.created', [unit]);
            processObject(unit.oid, unit);
        }]
    ];
    // Fix duplication
    const map = G.leafMap;
    const popup = L.popup({minWidth: 200, maxWidth: 600});
    const menuElem = constructMenu({
        menuItems: items,
        header: 'Map Menu'
    }, () => {map.closePopup()});

    popup.setLatLng(mapPos)
        .setContent(menuElem)
        .openOn(map);
};

function openModifyUnitMenu (unit) {

    function htmlToElement(html) {
        const template = document.createElement('template');
        template.innerHTML = html.trim();
        return template.content.firstChild;
    }

    function mdcSelector(id, label) {
        const html = `
            <section>          
                <div class="mdc-select" data-mdc-auto-init="MDCSelect">
                <select class="mdc-select__native-control" id="${id}">
            </select>
            <label class="mdc-floating-label">${label}</label>
            <div class="mdc-line-ripple"></div>
          </div>
        </section>`;
        return htmlToElement(html);
    }

    function createSelectorFromCodeMap(label, id, codeMap) {
        // Fix order later...
        const selector = mdcSelector(id, label);
        const selectElem = selector.querySelector('#' + id);
        codeMap.entries.forEach(([code, text], i) => {
            selectElem.add(new Option(text, code, false, i == 0));
        });
        const jsSelect = new mdc.select.MDCSelect(selector);
        jsSelect.listen('change', () => {
            updateSymbol();
        });

        return selector;
    }

    function createTextElement(label, id) {
        const html = `
            <section>
                <div class="mdc-text-field" data-mdc-auto-init="MDCTextField">
                  <input type="text" id="${id}" class="mdc-text-field__input">
                  <label class="mdc-floating-label" for="${id}">${label}</label>
                  <div class="mdc-line-ripple"></div>
                </div>
            </section>`;
        const elem = htmlToElement(html);
        const mdcTextField = new mdc.textField.MDCTextField(elem.querySelector('.mdc-text-field'));
        mdcTextField.listen('keyup', () => updateSymbol());
        return elem;
    }

    const mdcDialog = htmlToElement(`
        <aside id="dialog-unit-symbol"
          class="mdc-dialog"
          role="alertdialog"
          aria-labelledby="dialog-unit-symbol-label"
          aria-describedby="dialog-unit-symbol-description">
          <div class="mdc-dialog__surface">
            <header class="mdc-dialog__header">
              <h2 id="dialog-unit-symbol-label" class="mdc-dialog__header__title">
                Configure Unit Symbol
              </h2>
            </header>

            <div class="mdc-layout-grid">
                <div class="mdc-layout-grid__inner">
                    <div class="mdc-layout-grid__cell--span-6">
                        <section id="dialog-unit-symbol-description" class="mdc-dialog__body"></section>
                    </div>
                    <div class="mdc-layout-grid__cell--span-6">
                        <section id="dialog-unit-symbol-preview" class="mdc-dialog__body">
                        </section>
                    </div>
                </div>
            </div>
            
            <footer class="mdc-dialog__footer">
              <button type="button" class="mdc-button mdc-dialog__footer__button mdc-dialog__footer__button--cancel">Decline</button>
              <button type="button" class="mdc-button mdc-dialog__footer__button mdc-dialog__footer__button--accept">Accept</button>
            </footer>
          </div>
          <div class="mdc-dialog__backdrop"></div>
        </aside>`
    );

    const containerHtml = `<div class='mdc-typography' style="margin-left: auto; margin-right: auto;">`;

    // Construct Menu
    const containerElem = htmlToElement(containerHtml);
    containerElem.appendChild(createSelectorFromCodeMap('Affiliation', 'affiliation', symbol.IDENTITY));
    containerElem.appendChild(createSelectorFromCodeMap('Echelon', 'land-unit-echelon', symbol.LAND_UNIT_ECHELON));
    containerElem.appendChild(createSelectorFromCodeMap('Entity', 'land-unit-entity', symbol.LAND_UNIT_ENTITY));
    containerElem.appendChild(createSelectorFromCodeMap('Modifier 1', 'land-units-modifier_1', symbol.LAND_UNITS_MODIFIER_1));
    containerElem.appendChild(createSelectorFromCodeMap('Modifier 2', 'land-units-modifier_2', symbol.LAND_UNITS_MODIFIER_2));
    containerElem.appendChild(createTextElement('Designation', 'designation'));
    containerElem.appendChild(createTextElement('Higher Formation', 'higher-formation'));

    // Initialize with data if possible
    const symbolDesc = (new symbol.SymbolCode(unit.identifier)).getDescription();
    const trySelect = (selection, text) => {
        const fullSelection = selection + ' option'; // + ' select option';
        const elems = containerElem.querySelectorAll(fullSelection);
        Array.from(elems).filter((elem) => elem.text === text).forEach((elem) => elem.selected = true);
    };
    trySelect('#affiliation', symbolDesc.identity);
    trySelect('#land-unit-echelon', symbolDesc.echelon);
    trySelect('#land-unit-entity', symbolDesc.entity);
    trySelect('#land-units-modifier_1', symbolDesc.modifier1);
    trySelect('#land-units-modifier_2', symbolDesc.modifier2);

    containerElem.querySelector('#designation').value = unit.options ? unit.options.uniqueDesignation : '';
    containerElem.querySelector('#higher-formation').value = unit.options ? unit.options.higherFormation : '';


    // Preview
    var lastSidc = '';
    var lastOptions = {};
    function updateSymbol() {
        const codeAffiliation = mdcDialog.querySelector('#affiliation').value;
        const codeEchelon = mdcDialog.querySelector('#land-unit-echelon').value;
        const codeEntity = mdcDialog.querySelector('#land-unit-entity').value;
        const codeModifier1 = mdcDialog.querySelector('#land-units-modifier_1').value;
        const codeModifier2 = mdcDialog.querySelector('#land-units-modifier_2').value;
        const code = '10' + '0' + codeAffiliation + '10' + '0' + '0' + codeEchelon + codeEntity + codeModifier1 + codeModifier2;
        lastSidc = code;
        const container = mdcDialog.querySelector('#dialog-unit-symbol-preview');

        const options = {size: 100};
        options.uniqueDesignation = mdcDialog.querySelector('#designation').value || '';
        options.higherFormation = mdcDialog.querySelector('#higher-formation').value || '';
        lastOptions = options;
        delete lastOptions['size'];

        const iconSvgText = new ms.Symbol(code, options).asSVG();
        container.innerHTML = iconSvgText;
    }

    mdcDialog.style.zIndex = "99999";
    mdcDialog.querySelector('#dialog-unit-symbol-description').appendChild(containerElem);
    document.body.appendChild(mdcDialog);
    const dialog = new mdc.dialog.MDCDialog(mdcDialog);

    const deleteDialog = () => document.body.removeChild(mdcDialog);
    const onAccept = () => {
        unit.identifier = lastSidc;
        unit.options = lastOptions;
        markModified(unit);
        deleteDialog();
    };

    dialog.listen('MDCDialog:accept', onAccept);
    dialog.listen('MDCDialog:cancel', deleteDialog);

    dialog.show();
    mdc.autoInit();
    updateSymbol();
};

export function initHandling () {
    G.leafMap.on('contextmenu', (e) => {
        onMapContextMenu(e.latlng);
    });
};
