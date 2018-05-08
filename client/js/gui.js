
(function (BP) {
    
    const gui = BP.gui = {};

    class GuiObject {
        constructor(oid) {
            this.oid = oid;
        }
        toJSON() {
            throw Error('toJSON must be overridden');
        }

        updateFromJSON(json) {
            throw Error('updateFromJSON must be overridden');
        }

        static fromJSON(json) {
            throw Error('fromJSON must be overridden');
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

    class Unit extends GuiObject {

        constructor(oid, identifier) {
            super(oid);
            this.identifier = identifier;
            this.pos = [0, 0];
            this.isDraggable = false;
            this._guiState = {};

            // Optionally set elsewhere
            //this.options = {};
        }

        get _serializeProperties() {
            return ['oid', 'identifier', 'pos', 'isDraggable', 'options'];
        }

        toJSON() {
            const result = {};
            this._serializeProperties.forEach((propName) => {
                if (propName in this) {
                    result[propName] = this[propName];
                }
            });
            return result;
        }

        updateFromJSON(json) {
            this._serializeProperties.forEach((propName) => {
                if (propName in json) {
                    this[propName] = json[propName];
                }
            });
        }

        static fromJSON(json) {
            const unit = new Unit(json.oid, json.identifier);
            unit.updateFromJSON(json);
            return unit;
        }

        updateGui() {
            this.removeFromGui();
            const icon = BP.gui.getIconForUnit(this);
            const leafPos = L.latLng(G.bpMap.gameToMap(this.pos));
            const marker = L.marker(leafPos, {icon: icon, draggable: this.isDraggable});
            marker.addTo(G.markerLayer);

            marker.on('contextmenu', (event) => {
                gui.onUnitContextMenu(this);
            });
            
            marker.on('moveend', (event) => {
                this.pos = G.bpMap.mapToGame(marker.getLatLng());
                gui.markModified(this, 'remote');
            });

            this._guiState.layer = marker;
        }

        removeFromGui() {
            if (this._guiState.layer) {
                G.markerLayer.removeLayer(this._guiState.layer);
                this._guiState.layer = null;
            }
        }
    }


    function randomElem(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    const objectState = Object.create(null);
    var guiModifiedObjects = Object.create(null);
    var guiModifyHandler = null;

    gui.getObjectId = function (prefix) {
        var unique = false;
        var oid = '';
        while (!unique) {
            oid = prefix + Math.random().toString(36).slice(2);
            unique = !(oid in objectState);
        }
        return oid;
    };

    gui.getRandomUnit = function () {
        const description = gui.getRandomUnitDescription();
        const symbolCode = BP.symbol.SymbolCode.fromDescription(description).toString();
        return new Unit(gui.getObjectId('unit.'), symbolCode);
    };

    gui.getRandomUnitDescription = function () {
        const S = BP.symbol;
        const description = {
            affiliation: randomElem(['Friend', 'Hostile', 'Neutral']),
            type: 'Land Unit',
            status: 'Present',
            // Skip HQ/TF/Dummy
            echelon: randomElem(S.LAND_UNIT_ECHELON.entries.filter(([code, text]) => {
                const number = parseInt(code, 10);
                return number >= 12 && number <= 18;
            }))[1],
            entity: randomElem(S.LAND_UNIT_ENTITY.texts)
            // Skip modifiers
        };
        return description;
    };

    // Translate to milsymbol and retrieve
    gui.getIconForUnit = function (unit) {
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

    gui.processState = function (state) {
        // Remove everything existing
        Object.keys(objectState).forEach((oid) => {
            gui.processObject(oid, null);
        });
        // Recreate
        Object.keys(state).forEach((oid) => {
            const object = state[oid];
            gui.processObject(object.oid, object);
        });
    };

    gui.getTypeFromOid = function (oid) {
        return oid.split('.')[0];
    };

    /*
        Derives processing from object identifier (oid)
    */
    gui.processObject = function (oid, data) {
        const objectType = gui.getTypeFromOid(oid);

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
            console.log('removing existing');
        } else {
            if (existing === null) {
                existing = Unit.fromJSON(data);
                objectState[oid] = existing;
            } else {
                existing.updateFromJSON(data);
            }
            existing.updateGui();
            console.log('adding');
        }
    };

    gui.getState = function () {
        const stateCopy = JSON.parse(JSON.stringify(objectState));
        return stateCopy;
    };

    gui.ensureDeleted = function(oid) {
        if (objectState[oid]) {
            delete objectState[oid];
        }
    };

    /*
        This function is used to collect all modifications to prevent sending redudant information
    */
    gui.markModified = function (object, sync) {
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
                        gui.processObject(object.oid, object);    
                    }
                });
                // Reset list
                guiModifiedObjects = Object.create(null);
                guiModifyHandler = null;
            }, 0);
        }
    };

    gui.constructMenu = function (options, onItemSelected) {
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
                if (optionData === 'SEPARATOR') {
                    const elem = document.createElement('hr');
                    containerElem.appendChild(elem);
                }
            }
        });

        return containerElem;
    };

    gui.onUnitContextMenu = function (unit) {
        const items = [
            ['Delete', () => {
                G.events.trigger('gui.object.deleted', [unit]);
                gui.processObject(unit.oid, null);
            }]
            ,
            ['Modify Symbol', () => gui.openModifyUnitMenu(unit)]
        ];

        if (unit.isDraggable) {
            items.push(['Disable Dragging', () => {
                unit.isDraggable = false;
                gui.markModified(unit);
            }]);
        } else {
            items.push(['Enable Dragging', () => {
                unit.isDraggable = true;
                gui.markModified(unit);
            }]);
        }

        // items.push('SEPARATOR');

        // if (unit.axis) {
        //     items.push(['Remove Axis', () => {
        //         const axisOid = unit.axis;
        //         delete unit['axis'];

        //         const axis = objectState[axisOid];
        //         G.events.trigger('gui.object.deleted', [axis]);
        //         gui.processObject(axis.oid, null);
        //         G.events.trigger('gui.object.updated', [unit]);
        //         gui.processObject(unit.oid, unit);
        //     }]);
        // } else {
        //     items.push(['Add Axis', () => {
        //         const map = G.leafMap;
        //         const onClick = (e) => {
        //             const mapPos = e.latlng;
        //             const gamePos = G.bpMap.mapToGame(mapPos);
        //             const axisFrom = [unit.pos[0], unit.pos[1]];
        //             const axisTo = gamePos;
        //             const newAxisOid = gui.getObjectId('axis.');
        //             const newAxis = {
        //                 oid: newAxisOid,
        //                 owner: unit.oid,
        //                 fromPos: axisFrom,
        //                 toPos: axisTo
        //             };
        //             unit.axis = newAxisOid;
        //             G.events.trigger('gui.object.created', [newAxis]);
        //             gui.processObject(newAxis.oid, newAxis);
        //             G.events.trigger('gui.object.updated', [unit]);
        //             gui.processObject(unit.oid, unit);
        //             map.off('click', onClick);
        //         };
        //         map.on('click', onClick);
        //     }]);
        // }

        const map = G.leafMap;
        const mapPos = new L.latLng(G.bpMap.gameToMap(unit.pos));
        const popup = L.popup({minWidth: 200, maxWidth: 600});
        
        const menuElem = gui.constructMenu({
            menuItems: items,
            header: 'Unit Menu'
        }, () => map.closePopup());

        popup.setLatLng(mapPos)
            .setContent(menuElem)
            .openOn(map);
    };

    gui.onMapContextMenu = function (mapPos) {
        const items = [
            ['Create Unit', () => {
                const unit = gui.getRandomUnit();
                unit.pos = G.bpMap.mapToGame(mapPos);
                G.events.trigger('gui.object.created', [unit]);
                gui.processObject(unit.oid, unit);
            }]
        ];
        // Fix duplication
        const map = G.leafMap;
        const popup = L.popup({minWidth: 200, maxWidth: 600});
        const menuElem = gui.constructMenu({
            menuItems: items,
            header: 'Map Menu'
        }, () => {map.closePopup()});

        popup.setLatLng(mapPos)
            .setContent(menuElem)
            .openOn(map);
    };

    gui.openModifyUnitMenu = function (unit) {

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
        const S = BP.symbol;
        const containerElem = htmlToElement(containerHtml);
        containerElem.appendChild(createSelectorFromCodeMap('Affiliation', 'affiliation', S.IDENTITY));
        containerElem.appendChild(createSelectorFromCodeMap('Echelon', 'land-unit-echelon', S.LAND_UNIT_ECHELON));
        containerElem.appendChild(createSelectorFromCodeMap('Entity', 'land-unit-entity', S.LAND_UNIT_ENTITY));
        containerElem.appendChild(createSelectorFromCodeMap('Modifier 1', 'land-units-modifier_1', S.LAND_UNITS_MODIFIER_1));
        containerElem.appendChild(createSelectorFromCodeMap('Modifier 2', 'land-units-modifier_2', S.LAND_UNITS_MODIFIER_2));
        containerElem.appendChild(createTextElement('Designation', 'designation'));
        containerElem.appendChild(createTextElement('Higher Formation', 'higher-formation'));

        // Initialize with data if possible
        const symbolDesc = (new S.SymbolCode(unit.identifier)).getDescription();
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
            const test = mdcDialog.querySelector('#affiliation');
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
            gui.markModified(unit);
            deleteDialog();
        };

        dialog.listen('MDCDialog:accept', onAccept);
        dialog.listen('MDCDialog:cancel', deleteDialog);

        dialog.show();
        mdc.autoInit();
        updateSymbol();
    };

    gui.initHandling = function () {
        G.leafMap.on('contextmenu', (e) => {
            gui.onMapContextMenu(e.latlng);
        });
    };

})(window.BP = window.BP || {});
