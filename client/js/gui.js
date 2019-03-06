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
        /* Options are more specific entries to the symbol. E.g.
            - higherFormation
            - designation
        */
        this.options = {}; 
        /* Stats are various entries shown when selected */
        this.stats = [];
    }

    serialize(encoder) {
        encoder.store('oid', this.oid);
        encoder.store('identifier', this.identifier);
        encoder.store('pos', this.pos);
        encoder.store('isDraggable', this.isDraggable);
        encoder.store('orders', this._orders);
        encoder.store('options', this.options);
        encoder.store('stats', this.stats);
    }

    static deserialize(decoder) {
        const oid = decoder.get('oid');
        const identifier = decoder.get('identifier');
        const result = new Unit(oid, identifier);
        result.pos = decoder.get('pos', result.pos);
        result.isDraggable = decoder.get('isDraggable', result.isDraggable);
        result._orders = decoder.get('orders', []);
        result.options = decoder.get('options', {});
        result.stats = decoder.get('stats', []);
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
        
        marker.on('click', (event) => {
            triggerGuiEvent('click.unit', {
                unit: this
            });
        });

        marker.on('contextmenu', (event) => {
            triggerGuiEvent('rightclick.unit', {
                unit: this
            });
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

export class FreehandStroke extends GuiObject {

    constructor(oid, options) {
        super(oid);
        this._points = [];
        this._options = Object.assign({
            color: 'red',
            width: 5,
            opacity: 0.8
        }, options);
        this._layer = L.polyline([], {});
        this._layer.on('contextmenu', e => triggerGuiEvent('rightclick.freehand', {
            freehand: this,
            clickPos: e.latlng
        }));
        this._layer.on('click', e => triggerGuiEvent('click.freehand', {
            freehand: this,
            clickPos: e.latlng
        }));
        this._isHidden = true;
        this._needsUpdate = true;
    }

    serialize(encoder) {
        encoder.store('oid', this.oid);
        encoder.store('points', this._points);
        encoder.store('options', this._options);
    }

    static deserialize(decoder) {
        const oid = decoder.get('oid');
        const _points = decoder.get('points', []);
        const _options = decoder.get('options', {});
        const result = new FreehandStroke(oid, _options);
        result.setPoints(_points);
        return result;
    }

    setPoints(points) {
        this._points = points.map(this._toPoint);
        this._needsUpdate = true;
    }

    considerPoint(latLng) {
        this._points.push(this._toPoint(latLng));
        this._needsUpdate = true;
    }

    getOptions() {
        return Object.assign({}, this._options);
    }

    updateOptions(options) {
        Object.assign(this._options, options);
    }

    _toPoint(point) {
        return L.latLng(point);
    }

    _updateLayer() {
        this._layer.setStyle({
            width: this._options.width,
            color: this._options.color,
            opacity: this._options.opacity,
            dashArray: "8 6"
        });
        this._layer.setLatLngs(Array.from(this._points));
        this._layer.redraw();
    }

    updateGui() {
        if (this._needsUpdate) {
            this._needsUpdate = false;
            this._updateLayer();
        }
        if (this._isHidden) {
            this._isHidden = false;
            this._layer.addTo(G.leafMap);
        }
    }

    removeFromGui() {
        this._layer.remove();
        this._isHidden = true;
    }
}

class Attribute {
    createDom() {
        throw 'Must be overridden';
    }

    getValue() {
        throw 'Must be overridden';
    }

    setValue() {
        throw 'Must be overridden';
    }
}

export class RangeAttribute extends Attribute {
    constructor(options) {
        super();
        this._options = Object.assign({
            value: 0,
            minValue: 0,
            maxValue: 100,
            step: 1
        }, options);
    }

    createDom() {
        const elem = document.createElement('div');
        elem.className += ' bp-attribute bp-attribute-range ';
        const input = document.createElement('input');
        input.className += ' slider ';
        input.type = 'range';
        input.min = this._options.minValue;
        input.max = this._options.maxValue;
        input.value = this._options.value;
        elem.appendChild(input);

        return elem;
    }

    getValue() {
        return this._options.value;
    }

    setValue() {
        return this._options.value;
    }
}


function randomElem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

const objectState = Object.create(null);
var guiModifiedObjects = Object.create(null);
var guiModifyHandler = null;
var guiPointers = Object.create(null);

function triggerGuiEvent(name, event) {
    name = name.toLowerCase();
    G.activityStack.handleEvent(name, event);
    const simpleEvent = name.split('.', 1)[0];
    if (simpleEvent !== name) {
        G.activityStack.handleEvent(simpleEvent, event);
    }
};

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

    if (objectType !== 'unit' && objectType !== 'freehand') {
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

export function processPointing (data) {
    const cid = data['client-id'];
    const removeDelayMs = 1000;
    let entry = guiPointers[cid];

    const deleteEntry = () => {
        const entry = guiPointers[cid];
        if (entry) {
            entry.layer.remove();
        }
        delete guiPointers[cid];
    };

    if (!entry) {
        entry = guiPointers[cid] = {};
        entry.layer = L.circleMarker(L.latLng([0,0]), {
            radius: 10,
            color: 'red',
            weight: 2,
            fillColor: 'yellow',
            fillOpacity: 0.6,
            pane: 'transientPane'
        });
        entry.layer.addTo(G.leafMap);
    }

    entry.layer.setLatLng(G.bpMap.gameToMap(data.pos));
    if (entry.removeCallback) {
        window.clearTimeout(entry.removeCallback);
    }
    entry.removeCallback = window.setTimeout(deleteEntry, removeDelayMs);
};

// Warning: reference to real state
export function getState () {
    return objectState;    
};

/*
    This function is used to collect all modifications to prevent sending redundant information or doing duplicate work
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
    guiModifiedObjects[object.oid] = activeData;

    // Queue handler
    if (guiModifyHandler === null) {
        guiModifyHandler = window.setTimeout(() => {
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

function constructMenu (options, onAnyItemSelected) {
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
                    onAnyItemSelected();    
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

function showUnitStatus (unit) {
    // const stats = [
    //     {type: 'ratio', text: 'Manpower', value: '84 / 126'},
    //     {type: 'ratio', text: 'Ammunition', value: '56 / 100'},
    //     {type: 'ratio', text: 'Fatigue', value: '78 / 100', higherIsWorse: true}
    // ];
    // unit.stats = stats;

    const lerp = (a, b, f) => a*(1-f) + b*f;

    function redToGreen(fraction, higherIsBetter=true) {
        fraction = higherIsBetter ? fraction : (1 - fraction);
        if (fraction < 0.5) {
            return `rgb(255,${lerp(0, 255, fraction*2)},0)`;
        }
        return `rgb(${lerp(255, 0, (fraction-0.5)*2)}, 255, 0)`;
    }

    function makeRatio(data) {
        const [x, y] = data.value.split('/').map(x => parseFloat(x.trim()));
        const fraction = x / y;
        const container = document.createElement('div');
        container.className += ' bp-bar-container';
        const bar = document.createElement('p');
        bar.className += ' bp-bar';
        bar.style.backgroundColor = redToGreen(fraction, !data.higherIsWorse);
        bar.style.width = (fraction * 100) + '%';
        const text = document.createElement('span');
        text.textContent = data.text ? data.text + ' ' + data.value : '';

        bar.appendChild(text);
        container.appendChild(bar);
        return container;
    };

    const fieldMakers = {
        'ratio': makeRatio
    };

    const map = G.leafMap;
    const mapPos = new L.latLng(G.bpMap.gameToMap(unit.pos));

    const containerElem = document.createElement('div');
    containerElem.className += ' bp-contextmenu bp-contextmenu-unit-status';

    const headerElem = document.createElement('h1');
    headerElem.className = 'header';
    headerElem.textContent = 'Unit Status';
    containerElem.appendChild(headerElem);

    if (unit.stats.length > 0) {
        unit.stats.forEach(entry => containerElem.appendChild(fieldMakers[entry.type](entry)));
    } else {
        const statusElem = document.createElement('p');
        statusElem.className += ' fallback-message ';
        statusElem.textContent = 'No status available for unit';
        containerElem.appendChild(statusElem);
    }

    const activity = new PopupActivity({
        pos: mapPos,
        content: containerElem,
        map: map,
        minWidth: 300,
        maxWidth: 500
    });
    G.activityStack.push(activity);
}

function onUnitContextMenu (unit) {
    const map = G.leafMap;

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

    const mapPos = new L.latLng(G.bpMap.gameToMap(unit.pos));

    const menuElem = constructMenu({
        menuItems: items,
        header: 'Unit Menu'
    }, () => {activity.close()});

    const activity = new PopupActivity({
        pos: mapPos,
        content: menuElem,
        map: map,
        minWidth: 200,
        maxWidth: 600
    });

    G.activityStack.push(activity);
};

function onFreehandContextMenu ({freehand, clickPos}) {
    const map = G.leafMap;

    const items = [
        ['Delete', () => {
            G.events.trigger('gui.object.deleted', [freehand]);
            processObject(freehand.oid, null);
        }]
    ];

    const mapPos = clickPos;

    const menuElem = constructMenu({
        menuItems: items,
        header: 'Freehand Stroke Menu'
    }, () => {activity.close()});

    const activity = new PopupActivity({
        pos: mapPos,
        content: menuElem,
        map: map,
        minWidth: 200,
        maxWidth: 600
    });

    G.activityStack.push(activity);
};

function onMapContextMenu (mapPos) {
    const map = G.leafMap;
    const items = [
        ['Create Unit', () => {
            const unit = getRandomUnit();
            unit.pos = G.bpMap.mapToGame(mapPos);
            G.events.trigger('gui.object.created', [unit]);
            processObject(unit.oid, unit);
        }]
        ,
        ['Create Freehand Stroke', () => {
            G.activityStack.push(new NewFreehandStrokeActivity());
        }]
    ];

    const menuElem = constructMenu({
        menuItems: items,
        header: 'Map Menu'
    }, () => {activity.close()});

    const activity = new PopupActivity({
        pos: mapPos,
        content: menuElem,
        map: G.leafMap,
        minWidth: 200,
        maxWidth: 600
    });

    G.activityStack.push(activity);
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

    containerElem.querySelector('#designation').value = unit.options && unit.options.uniqueDesignation || '';
    containerElem.querySelector('#higher-formation').value = unit.options && unit.options.higherFormation || '';


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


class ActivityStack {
    constructor() {
        this._activities = [];
    }

    getCurrent() {
        return this._activities[this.count()-1];
    }

    count() {
        return this._activities.length;
    }

    push(activity) {
        if (this.count() > 0) {
            this.getCurrent().handleEvent('pause', {});
        }
        this._activities.push(activity);
        this.getCurrent().handleEvent('start', {});
    }

    pop(activity) {
        let didRemove = false;
        let didRemoveCurrent = false;
        if (activity) {
            let index = this._activities.slice().reverse().indexOf(activity);
            if (index >= 0) {
                // Unreverse index
                index = this._activities.length - 1 - index;
                this._activities.splice(index, 1);
                didRemove = true;
            }
            didRemoveCurrent = index === (this._activities.length-1);
        }
        //  else {
        //     this._activities.pop();
        //     didRemove = true;
        //     didRemoveCurrent = true;
        // }
        if (didRemoveCurrent && this.count() > 0) {
            this.getCurrent().handleEvent('resume', {});
        }
        return didRemove;
    }

    handleEvent(name, event) {
        this.getCurrent().handleEvent(name, event);
    }
}

const defaultActivity = (() => {
    const handledEvents = Object.create(null);

    handledEvents['rightclick.map'] = e => onMapContextMenu(e.latlng);
    handledEvents['click.unit'] = e => showUnitStatus(e.unit);
    handledEvents['rightclick.unit'] = e => onUnitContextMenu(e.unit);
    handledEvents['rightclick.freehand'] = e => onFreehandContextMenu(e);

    handledEvents['mousedown.map'] = e => {
        e.originalEvent.stopPropagation();
        const isCtrlDown = e.originalEvent.ctrlKey && !e.originalEvent.altKey && !e.originalEvent.shiftKey;
        if (isCtrlDown) {
            G.activityStack.push(new PointActivity(e.latlng));
        }
    };

    const _activity = {
        handleEvent(type, event) {
            const handler = handledEvents[type];
            if (handler) {
                handler(event);
            }
        }
    };
    return _activity;
})();

// Point Activity lets other users to see where you are pointing
class PointActivity {

    constructor(initialLatLng) {
        this._handledEvents = Object.create(null);
        this._setupEvents();
        this._pos = [0, 0];
        this._lastTriggeredMs = -99999;
        this._lastTriggeredPos = this._pos;
        this._maxInterval = 1000 / 2;
        this._minInterval = 1000 / 25;
        this._intervalCallbackId = window.setInterval(() => this._update(), Math.round(this._minInterval));
        if (initialLatLng) {
            this._handleMove(initialLatLng);
            this._update();
        }
    }

    _setupEvents() {
        this._handledEvents['mouseup'] = e => this._stop();
        this._handledEvents['mouseout'] = e => this._stop();
        this._handledEvents['mousemove'] = e => this._handleMove(e.latlng);
        const dragging = G.leafMap.dragging;
        this._reenableDrag = dragging.enabled();
        dragging.disable();
    }

    _update() {
        const [prevX, prevY] = this._lastTriggeredPos;
        const [x, y] = this._pos;
        const nowMs = new Date().getTime();
        if (x !== prevX || y !== prevY || (nowMs - this._lastTriggeredMs > this._maxInterval)) {
            this._lastTriggeredMs = nowMs;
            G.events.trigger('gui.pointing', [{
                pos: [x, y]
            }]);
        }
        this._lastTriggeredPos = this._pos;
    }

    _stop() {
        window.clearInterval(this._intervalCallbackId);
        if (this._reenableDrag) {
            G.leafMap.dragging.enable();
        }
        G.activityStack.pop(this);
    }

    _handleMove(pos) {
        this._pos = G.bpMap.mapToGame(pos);
    }

    handleEvent(type, event) {
        const handler = this._handledEvents[type];
        if (handler) {
            handler(event);
        }
    }
}

/*
    .onPopupClose() is run upon close
*/
class PopupActivity {
    constructor(options) {
        const _options = Object.assign({
            pos: [0, 0],
            content: '',
            map: G.leafMap,
            minWidth: 200,
            maxWidth: 600,
            closeButton: true,
            closeOnEscapeKey: true,
            closeOnClick: true
        }, options);

        const _leafOptions = Object.assign({}, _options);
        delete _leafOptions['pos'];
        delete _leafOptions['content'];
        this._popup = L.popup(_leafOptions);

        this.onPopupClose = null;
        this._popup.on('remove', e => this._onClose(false));
        this.setLatLng(_options.pos);
        this.setContent(_options.content);
        this._popup.openOn(_options.map);
    }

    setContent(stringOrHtml) {
        this._popup.setContent(stringOrHtml);
    }

    setLatLng(latLng) {
        this._popup.setLatLng(latLng);
    }

    close() {
        this._onClose(true);
    }

    _onClose(popupStillOpen) {
        if (popupStillOpen) {
            this._popup.remove();
        } else {
            if (this.onPopupClose) {
                this.onPopupClose();
            };
            G.activityStack.pop(this);
        }
    }

    handleEvent(type, event) {
        return;
    }
}

class NewFreehandStrokeActivity {
    constructor() {
        this._freehand = new FreehandStroke(getObjectId('freehand.'), {color: 'rgb(207,255,45)'});
        this._started = false;
    }

    _start() {
        this._started = true;
        this._couldDrag = G.leafMap.dragging.enabled();
        G.leafMap.dragging.disable();
    }

    _stop() {
        G.activityStack.pop(this);
        if (this._couldDrag) {
            G.leafMap.dragging.enable();
        }
    }
    
    handleEvent(type, event) {
        if (this._started) {
            if (type === 'mousemove.map') {
                this._freehand.considerPoint(event.latlng);
                markModified(this._freehand, 'local');
            } else if (type === 'mouseup') {
                markModified(this._freehand, 'local');
                G.events.trigger('gui.object.created', [this._freehand]);
                this._stop();
            }
        } else if (type === 'mousedown.map') {
            this._start();
        }
    }
}

export function initHandling () {
    G.activityStack = new ActivityStack();

    G.leafMap.on('click', e => triggerGuiEvent('click.map', e));
    G.leafMap.on('dblclick', e => triggerGuiEvent('dblclick.map', e));
    G.leafMap.on('mousedown', e => triggerGuiEvent('mousedown.map', e));
    G.leafMap.on('mouseup', e => triggerGuiEvent('mouseup.map', e));
    G.leafMap.on('mouseover', e => triggerGuiEvent('mouseover.map', e));
    G.leafMap.on('mouseout', e => triggerGuiEvent('mouseout.map', e));
    G.leafMap.on('mousemove', e => triggerGuiEvent('mousemove.map', e));
    G.leafMap.on('contextmenu', e => triggerGuiEvent('rightclick.map', e));
    G.leafMap.on('keypress', e => triggerGuiEvent('keypress.map', e));
    // G.leafMap.on('preclick', e => triggerGuiEvent('rightclick.map', e));

    G.activityStack.push(defaultActivity);
};
