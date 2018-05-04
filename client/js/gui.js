
(function (BP) {
    var gui;
    BP.gui = gui = {};

    /* --------------- Set A
        The first set of ten digits:  

        Digits 1 and 2 is the Version.   
        Digits 3 and 4 is the Standard Identity.  
        Digits 5 and 6 is the Symbol Set.   
        Digit 7 is the Status.   
        Digit 8 is the Headquarters/Task Force/Dummy.  
        Digits 9 and 10 is the Amplifier/Descriptor
    */

    var AFFILILIATION = {
        'PENDING': '0',
        'UNKNOWN': '1',
        'ASSUMED_FRIEND': '2',
        'FRIEND': '3',
        'NEUTRAL': '4',
        'SUSPECT': '5',
        'HOSTILE': '6'
    };

    // Symbol set
    var TYPE = {
        'UNKNOWN': '00',
        'AIR': '01',
        'AIR_MISSILE': '02',
        'SPACE': '05',
        'SPACE_MISSILE': '06',
        'LAND_UNIT': '10',
        'LAND_CIVILIAN_UNIT': '11',
        'LAND_EQUIPMENT': '15',
        'LAND_INSTALLATION': '20',
        'CONTROL_MEASURE': '25',
        'SEA_SURFACE': '30',
        'SEA_SUBSURFACE': '35',
        'MINE_WARFARE': '36',
        'ACTIVITIES': '40',
        'ATMOSPHERIC': '45',
        'OCEANOGRAPHIC': '46',
        'METEOROLOGICAL_SPACE': '47',
        'SIGNALS_INTELLIGENCE_–SPACE': '50',
        'SIGNALS_INTELLIGENCE–AIR': '51',
        'SIGNALS_INTELLIGENCE–LAND': '52',
        'SIGNALS_INTELLIGENCE–SURFACE': '53',
        'SIGNALS_INTELLIGENCE–SUBSURFACE': '54',
        'CYBERSPACE': '60'
    };

    var STATUS = {
        'PRESENT': '0',
        'PLANNED/ANTICIPATED/SUSPECT': '1',
        'PRESENT/FULLY_CAPABLE': '2',
        'PRESENT/DAMAGED': '3',
        'PRESENT/DESTROYED': '4',
        'PRESENT/FULL_TO_CAPACITY': '5'
    };

    // Headquarters/Task Force/Dummy
    var HQ_TF_DUMMY = {
        'UNKNOWN': '0',
        'FEINT/DUMMY': '1',
        'HEADQUARTERS': '2',
        'FEINT/DUMMY_HEADQUARTERS': '3',
        'TASK_FORCE': '4',
        'FEINT/DUMMY_TASK_FORCE': '5',
        'TASK_FORCE_HEADQUARTERS': '6',
        'FEINT/DUMMY_TASK_FORCE_HEADQUARTERS': '7'
    };

    // Echelon / Mobility / Towed array
    var ECHELON = {
        'UNKNOWN': '00',
        // Brigade and below
        'TEAM/CREW': '11',
        'SQUAD': '12',
        'SECTION': '13',
        'PLATOON/DETACHMENT': '14',
        'COMPANY/BATTERY/TROOP': '15',
        'BATTALION/SQUADRON': '16',
        'REGIMENT/GROUP': '17',
        'BRIGADE': '18',
        // Division and above
        'DIVISION': '21',
        'CORPS/MEF': '22',
        'ARMY': '23',
        'ARMY_GROUP/FRONT': '24',
        'REGION/THEATER': '25',
        'COMMAND': '26',
        // Land mobility
        'WHEELED_LIMITED_CROSS_COUNTRY': '31',
        'WHEELED_CROSS_COUNTRY': '32',
        'TRACKED': '33',
        'WHEELED_AND_TRACKED_COMBINATION': '34'
    };

    /* --------------- Set B

        The second set of ten digits:

        Digits 11 and 12 is the entity.
        Digits 13 and 14 is the entity type.
        Digits 15 and 16 is the entity subtype.
        Digits 17 and 18 is the first modifier.
        Digits 19 and 20 is the second modifier.
    */

    var ENTITY = {
          'Unit.Land.Maneuvre.Infantry': '121100'
        , 'Unit.Land.Maneuvre.Infantry.Motorized': '121104'
        , 'Unit.Land.Maneuvre.Infantry.Mechanized': '121102'
        , 'Unit.Land.Maneuvre.Infantry.Cavalry': '121300' //TODO: Fix should not be under infantry.
        , 'Unit.Land.Maneuvre.Antitank': '120400'
        , 'Unit.Land.Maneuvre.Armoured': '120500'
    };

    function randomElem(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    const objectState = Object.create(null);
    const guiState = Object.create(null);

    gui.getObjectId = function (prefix) {
        var unique = false;
        var oid = '';
        while (!unique) {
            oid = prefix + Math.random().toString(36).slice(2);
            unique = !(oid in objectState);
        }
        return oid;
    }

    gui.getRandomUnitDescription = function () {
        return {
            oid: gui.getObjectId('unit.'),
            type: 'unit',
            entityType: randomElem(Object.keys(ENTITY)),
            affiliation: randomElem(['FRIEND', 'NEUTRAL', 'HOSTILE']),
            echelon: randomElem(['UNKNOWN', 'SECTION', 'PLATOON/DETACHMENT', 'COMPANY/BATTERY/TROOP', 'BATTALION/SQUADRON', 'BRIGADE'])
        };
    };

    // Translate to milsymbol and retrieve
    gui.getIconForUnit = function (description) {
        const version = '10'; // No change
        const identity = 0 + AFFILILIATION[description.affiliation]; // 0 is reality
        const symbolSet = TYPE['LAND_UNIT']
        // const status = description.affiliation === 'HOSTILE' ? STATUS['PLANNED/ANTICIPATED/SUSPECT'] : STATUS['PRESENT']
        const status = STATUS['PRESENT']
        const special = HQ_TF_DUMMY['UNKNOWN']
        const echelon = ECHELON[description.echelon]
        const type = ENTITY[description.entityType];
        const modifier1 = '00';
        const modifier2 = '00';
        const sidc = version + identity + symbolSet + status + special + echelon + type + modifier1 + modifier2;

        const milSymbol = new ms.Symbol(sidc, {size: 35});
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
        } else {
            console.log(`Unknown object type '${objectType}' for id '${oid}'`)
        }
    };

    gui.getState = function () {
        const stateCopy = JSON.parse(JSON.stringify(objectState));
        return stateCopy;
    }

    gui.ensureDeleted = function(oid) {
        if (objectState[oid]) {
            delete objectState[oid];
        }
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
            // Reestablish gui part
            const icon = BP.gui.getIconForUnit(unit);
            const leafPos = L.latLng(G.bpMap.gameToMap(unit.pos));
            const marker = L.marker(leafPos, {icon: icon, draggable: true});
            marker.addTo(G.markerLayer);

            marker.on('contextmenu', (event) => {
                G.events.trigger('gui.unit.deleted', [unit]);
            });
            
            marker.on('moveend', (event) => {
                unit.pos = G.bpMap.mapToGame(marker.getLatLng());
                G.events.trigger('gui.unit.updated', [unit]);
            });

            // Update state entry
            objectState[oid] = unit;
            guiState[oid] = {
                layer: marker
            };
        };
    };

})(window.BP = window.BP || {});


/* Python extract from PDF
matches = re.findall(r'\s*(\D+)\s*(\d+)\s*', text)
matches = [(re.sub(r'\n', '', t.strip()), n) for t, n in matches]
matches = [(re.sub(r'[\s-]+', '_', t), n) for t, n in matches]

print(',\n'.join("'%s': '%s'" % (key.upper(), num) for key, num in matches))
*/
