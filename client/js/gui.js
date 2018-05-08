
(function (BP) {
    
    const gui = BP.gui = {};


    /* --------------- Set A
        The first set of ten digits:  

        Digits 1 and 2 is the Version.   
        Digits 3 and 4 is the Standard Identity.  
        Digits 5 and 6 is the Symbol Set.   
        Digit 7 is the Status.   
        Digit 8 is the Headquarters/Task Force/Dummy.  
        Digits 9 and 10 is the Amplifier/Descriptor
    */
    const AFFILIATION = {
          'Pending': '0'
        , 'Unknown': '1'
        , 'Assumed Friend': '2'
        , 'Friend': '3'
        , 'Neutral': '4'
        , 'Suspect': '5'
        , 'Hostile': '6'
    };

    // Symbol set
    const TYPE = {
        'Land Unit': '10'
    };

    const STATUS = {
          'Present': '0'
        , 'Planned/Anticipated/Suspect': '1'
        , 'Present/Fully Capable': '2'
        , 'Present/Damaged': '3'
        , 'Present/Destroyed': '4'
        , 'Present/Full to capacity': '5'
    };

    // Headquarters/Task Force/Dummy
    const HQ_TF_DUMMY = {
          'Not Applicable': '0'
        , 'Feint/Dummy': '1'
        , 'Headquarters': '2'
        , 'Feint/Dummy Headquarters': '3'
        , 'Task Force': '4'
        , 'Feint/Dummy Task Force': '5'
        , 'Task Force Headquarters': '6'
        , 'Feint/Dummy Fask Force Headquarters': '7'
    };

    // Echelon / Mobility / Towed array
    const LAND_UNIT_ECHELON = {
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
    };

    const LAND_EQUIPMENT_ECHELON = {
        // Land mobility
          'Wheeled Limited Cross Country': '31'
        , 'Wheeled Cross Country': '32'
        , 'Tracked': '33'
        , 'Wheeled and Tracked Combination': '34'
    };

    /* --------------- Set B

        The second set of ten digits:

        Digits 11 and 12 is the entity.
        Digits 13 and 14 is the entity type.
        Digits 15 and 16 is the entity subtype.
        Digits 17 and 18 is the first modifier.
        Digits 19 and 20 is the second modifier.
    */

    const LAND_UNIT_ENTITY = {
          'Unspecified': '000000'
        , 'Infantry': '121100'
        , 'Infantry - Motorized': '121104'
        , 'Infantry - Mechanized': '121102'
        , 'Cavalry': '121300'
        , 'Antitank': '120400'
        , 'Armoured': '120500'
    };

    const LAND_UNITS_MODIFIER_1 = {
          'Unspecified': '00'
        , 'Air Mobile/Assault': '01'
        , 'Bridging': '06'
        , 'Command and Control': '10'
    };

    const LAND_UNITS_MODIFIER_2 = {
          'Unspecified': '00'
        , 'Airborne': '01'
        , 'Arctic': '02'
        , 'Bicycle Equipped': '04'
        , 'Mountain': '27'
    };

    gui.SymbolCode = function(sidc) {
        this.sidc = sidc || '10011000000000000000';
        return this;
    };

    gui.SymbolCode.fromDescription = function (description) {
        const version = '10'; // No change
        const identity = '0' + AFFILIATION[description.affiliation || 'Unknown']; // 0 is reality
        const symbolSet = TYPE[description.type || 'Land Unit'];
        const status = STATUS[description.status || 'Present'];
        const special = HQ_TF_DUMMY[description.hq_tf_dummy || 'Not Applicable'];
        const echelon = LAND_UNIT_ECHELON[description.echelon || 'Unspecified']
        const entity = LAND_UNIT_ENTITY[description.entity || 'Infantry'];
        const modifier1 = LAND_UNITS_MODIFIER_1[description.modifier1 || 'Unspecified'];
        const modifier2 = LAND_UNITS_MODIFIER_1[description.modifier2 || 'Unspecified'];
        const sidc = version + identity + symbolSet + status + special + echelon + entity + modifier1 + modifier2;
        return new gui.SymbolCode(sidc);
    };

    gui.SymbolCode.prototype.toString = function () {
        return this.sidc;
    };

    gui.SymbolCode.prototype.getDescription = function () {
        const code = this.sidc;
        // Inefficient!!!
        function reverseFind(dict, value) {
            for (var k in dict) {
                if (dict[k] === value) {
                    return k;
                }
            }
            return '-';
        }
        return {
            version: '10',
            identity1: 'Reality',
            affiliation: reverseFind(AFFILIATION, code.slice(3, 4)),
            type: reverseFind(TYPE, code.slice(4, 6)),
            status: reverseFind(STATUS, code.slice(6, 7)),
            hq_tf_dummy: reverseFind(HQ_TF_DUMMY, code.slice(7,8)),
            echelon: reverseFind(LAND_UNIT_ECHELON, code.slice(8,10)),
            entity: reverseFind(LAND_UNIT_ENTITY, code.slice(10, 16)),
            modifier1: reverseFind(LAND_UNITS_MODIFIER_1, code.slice(16,18)),
            modifier2: reverseFind(LAND_UNITS_MODIFIER_2, code.slice(18, 29))
        };
    };

    function randomElem(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    const objectState = Object.create(null);
    const guiState = Object.create(null);
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
        const symbolCode = new gui.SymbolCode.fromDescription(description).toString();
        return {
            oid: gui.getObjectId('unit.'),
            identifier: symbolCode
        };
    };

    gui.getRandomUnitDescription = function () {
        const description = {
            affiliation: randomElem(['Friend', 'Hostile', 'Neutral']),
            type: 'Land Unit',
            status: 'Present',
            // Skip HQ/TF/Dummy
            echelon: randomElem(Object.keys(LAND_UNIT_ECHELON).filter((k) => {
                const number = parseInt(LAND_UNIT_ECHELON[k], 10);
                return number >= 12 && number <= 18;
            })),
            entity: randomElem(Object.keys(LAND_UNIT_ENTITY))
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
    gui.processObject = function (oid, object) {
        const objectType = gui.getTypeFromOid(oid);
        if (objectType === 'unit') {
            gui.processUnit(oid, object);
            return;
        } 
        if (objectType === 'axis') {
            gui.processAxis(oid, object);
            return;
        }
        console.log(`Unknown object type '${objectType}' for id '${oid}'`)
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
    gui.markModifed = function (object, sync) {
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

        if (unit.guiIsDraggable) {
            items.push(['Disable Dragging', () => {
                unit.guiIsDraggable = false;
                gui.markModifed(unit);
            }]);
        } else {
            items.push(['Enable Dragging', () => {
                unit.guiIsDraggable = true;
                gui.markModifed(unit);
            }]);
        }

        items.push('SEPARATOR');

        if (unit.axis) {
            items.push(['Remove Axis', () => {
                const axisOid = unit.axis;
                delete unit['axis'];

                const axis = objectState[axisOid];
                G.events.trigger('gui.object.deleted', [axis]);
                gui.processObject(axis.oid, null);
                G.events.trigger('gui.object.updated', [unit]);
                gui.processObject(unit.oid, unit);
            }]);
        } else {
            items.push(['Add Axis', () => {
                const map = G.leafMap;
                const onClick = (e) => {
                    const mapPos = e.latlng;
                    const gamePos = G.bpMap.mapToGame(mapPos);
                    const axisFrom = [unit.pos[0], unit.pos[1]];
                    const axisTo = gamePos;
                    const newAxisOid = gui.getObjectId('axis.');
                    const newAxis = {
                        oid: newAxisOid,
                        owner: unit.oid,
                        fromPos: axisFrom,
                        toPos: axisTo
                    };
                    unit.axis = newAxisOid;
                    G.events.trigger('gui.object.created', [newAxis]);
                    gui.processObject(newAxis.oid, newAxis);
                    G.events.trigger('gui.object.updated', [unit]);
                    gui.processObject(unit.oid, unit);
                    map.off('click', onClick);
                };
                map.on('click', onClick);
            }]);
        }

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

    /*
        Fixes properties been added later
    */
    function fixUnitLegacy(unit) {
        unit.guiIsDraggable = !!unit.guiIsDraggable;
    }

    gui.processUnit = function (oid, unit) {
        if (unit === undefined) return;
        // Remove existing
        const existing = objectState[oid];
        if (existing) {
            G.markerLayer.removeLayer(guiState[oid].layer);
        }
        // Remove state entry if deleted
        if (unit === null) {
            gui.ensureDeleted(oid);
        } else {
            fixUnitLegacy(unit);
            // Reestablish gui part
            const icon = BP.gui.getIconForUnit(unit);
            const leafPos = L.latLng(G.bpMap.gameToMap(unit.pos));
            const marker = L.marker(leafPos, {icon: icon, draggable: unit.guiIsDraggable});
            marker.addTo(G.markerLayer);

            marker.on('contextmenu', (event) => {
                gui.onUnitContextMenu(unit);
            });
            
            marker.on('moveend', (event) => {
                unit.pos = G.bpMap.mapToGame(marker.getLatLng());
                gui.markModifed(unit, 'remote');
            });

            // Update state entry
            objectState[oid] = unit;
            guiState[oid] = {
                layer: marker
            };
        };
    };

    gui.processAxis = function (oid, axis) {
        if (axis === undefined) return;
        const existing = objectState[oid];
        if (existing) {
            G.axisLayer.removeLayer(guiState[oid].layer);
        }
        // Remote state entry if deleted
        if (axis === null) {
            gui.ensureDeleted(oid);
        } else {
            const fromPos = G.bpMap.gameToMap(axis.fromPos);
            const toPos = G.bpMap.gameToMap(axis.toPos);
            const line = L.polyline([fromPos, toPos], {color: 'blue', weight: 5});
            line.addTo(G.axisLayer);
            objectState[oid] = axis;
            guiState[oid] = {
                layer: line
            };
        }
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

        function createSelectorFromDict(label, id, dict) {
            // Fix order later...
            const selector = mdcSelector(id, label);
            const selectElem = selector.querySelector('#' + id);
            Object.keys(dict).forEach((key, i) => {
                const value = dict[key];
                selectElem.add(new Option(key, value, false, i == 0));
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

        const containerHtml = `
        <div class='mdc-typography' style="margin-left: auto; margin-right: auto;">`;
            // <h2 class="mdc-typography--display2">Select Symbol</h2></div>`;

        // Menus
        const containerElem = htmlToElement(containerHtml);
        containerElem.appendChild(createSelectorFromDict('Affiliation', 'affiliation', AFFILIATION));
        containerElem.appendChild(createSelectorFromDict('Echelon', 'land-unit-echelon', LAND_UNIT_ECHELON));
        containerElem.appendChild(createSelectorFromDict('Entity', 'land-unit-entity', LAND_UNIT_ENTITY));
        containerElem.appendChild(createSelectorFromDict('Modifier 1', 'land-units-modifier_1', LAND_UNITS_MODIFIER_1));
        containerElem.appendChild(createSelectorFromDict('Modifier 2', 'land-units-modifier_2', LAND_UNITS_MODIFIER_2));

        containerElem.appendChild(createTextElement('Designation', 'designation'));
        containerElem.appendChild(createTextElement('Higher Formation', 'higher-formation'));

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
            gui.markModifed(unit);
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


/* Python extract from PDF
matches = re.findall(r'\s*(\D+)\s*(\d+)\s*', text)
matches = [(re.sub(r'\n', '', t.strip()), n) for t, n in matches]
matches = [(re.sub(r'[\s-]+', '_', t), n) for t, n in matches]

print(',\n'.join("'%s': '%s'" % (key.upper(), num) for key, num in matches))
*/
