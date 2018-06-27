import {Map} from './map.js';
import * as net from './net.js';
import * as gui from './gui.js';
import * as guiOrder from './gui.order.js';
import * as testLeaflet from './leaflet/movesegment.js';
import * as leafMapGrid from './leaflet/map-grid.js';
import * as util from './util.js';

/*
TODO: Try to move modify symbol dialog into html instead.
CONSIDER: different detail level depending on map zoom.

NEED: Freedrawing
NEED: Multistage orders

TODO: Clean up unused gui state
*/
var mapConfigs = {};
mapConfigs.taunus = {
    title: "XCAM Taunus",
    tilePrefix: "maps/taunus/",
    lowerLeftPixel: [1*512+250, 37*512+154],
    lowerLeftPos: [0, 0],
    upperRightPixel: [38*512+100, 0*512+294],
    upperRightPos: [20480, 20480],
    pixelSize: [40*512, 38*512],
    maxZoom: 0,
    minZoom: -6,
    tileSize: 512
};

mapConfigs.staszow = {
    title: "Staszow",
    tilePrefix: "maps/staszow/",
    lowerLeftPixel: [1*512+470, 37*512+285],
    lowerLeftPos: [0, 0],
    upperRightPixel: [38*512+249, 0*512+432],
    upperRightPos: [16384, 16384],
    pixelSize: [41*512, 39*512],
    maxZoom: 0,
    minZoom: -6,
    tileSize: 512
};

mapConfigs.malden = {
    title: "Malden",
    tilePrefix: "maps/malden/",
    lowerLeftPixel: [1*512+77, 27*512+78],
    lowerLeftPos: [0, 0],
    upperRightPixel: [27*512+200, 0*512+468],
    upperRightPos: [12800, 12800],
    pixelSize: [29*512, 28*512],
    maxZoom: 0,
    minZoom: -5,
    tileSize: 512
};

mapConfigs.marenice = {
    title: "Marenice",
    tilePrefix: "maps/marenice/",
    lowerLeftPixel: [1*512+295, 22*512+272],
    lowerLeftPos: [0, 0],
    upperRightPixel: [23*512+231, 0*512+335],
    upperRightPos: [5120, 5120],
    pixelSize: [25*512, 24*512],
    maxZoom: 0,
    minZoom: -5,
    tileSize: 512
};

const G = window.G = {};
// Wire state events together
G.events = new EventEmitter();

G.bpMap = null;
G.tileLayer = null;
G.currentMap = 'marenice';
G.leafMap = L.map('bp_map', {crs: L.CRS.Simple});
G.axisLayer = L.layerGroup().addTo(G.leafMap);
G.markerLayer = L.layerGroup().addTo(G.leafMap);
G.currentRoom = null;
G.client = {id: null};

G.codec = new util.DictionaryCodec();
G.codec.addDeserializer('Unit', gui.Unit.deserialize);
G.codec.addDeserializer('MoveOrder', guiOrder.MoveOrder.deserialize);
G.codec.addDeserializer('FreehandStroke', gui.FreehandStroke.deserialize);

function changeMap(mapName) {
    G.bpMap = new Map(mapConfigs[mapName]);
    const mapCenter = new L.latLng(G.bpMap.gameToMap([G.bpMap.constants.gameWidth / 2, G.bpMap.constants.gameHeight / 2]));
    const mapBounds = L.latLngBounds([
        new L.latLng(G.bpMap.gameToMap(G.bpMap.constants.lowerLeftPos)),
        new L.latLng(G.bpMap.gameToMap(G.bpMap.constants.upperRightPos))
    ]);

    G.leafMap.setMinZoom(G.bpMap.info.minZoom);
    G.leafMap.setMaxZoom(G.bpMap.info.maxZoom);
    G.leafMap.setView(mapCenter, G.bpMap.info.minZoom + 5);
    G.leafMap.fitBounds(mapBounds.pad(-0.2));

    if (G.tileLayer) {
        G.leafMap.removeLayer(G.tileLayer);
    }
    const tileSize = G.bpMap.info.tileSize || 256;
    G.tileLayer = L.tileLayer(G.bpMap.info.tilePrefix + 'z{z}/image_{x}_{y}.jpg', {
            minZoom: G.bpMap.info.minZoom,
            maxZoom: G.bpMap.info.maxZoom,
            maxNativeZoom: G.bpMap.info.maxZoom,
            continuousWorld: true,
            bounds: mapBounds,
            tileSize: tileSize
        }).addTo(G.leafMap);
} 

changeMap(G.currentMap);

function setupGuiEvents() {

    const encode = x => G.codec.serialize(x);
    const decode = x => G.codec.deserialize(x);

    G.events.on('gui.object.created', (object) => {
        G.netContext.send({type: 'key-set', key: object.oid, value: encode(object)});
    });

    G.events.on('gui.object.deleted', (object) => {
        G.netContext.send({type: 'key-delete', key: object.oid});
    });

    G.events.on('gui.object.updated', (object) => {
        G.netContext.send({type: 'key-set', key: object.oid, value: encode(object)});
    });

    G.events.on('state.received', (remoteState) => {
        gui.processState(decode(remoteState));
    });

    G.events.on('state.send', (state) => {
        G.netContext.send({
            type: 'state',
            state: encode(state)
        });
    });

    G.events.on('remote.object.updated', (data) => {
        gui.processObject(data.oid, decode(data.object));
    });

    G.events.on('remote.pointing', (data) => {
        gui.processPointing(data);
    });

    G.events.on('gui.pointing', (data) => {
        // TODO: process pointing
        G.netContext.send({
            type: 'transient',
            'sub-type': 'pointing',
            pos: data.pos,
            'client-id': G.client.id
        });
        gui.processPointing(data);
    });
}

setupGuiEvents();

let userAction;
window.userAction = userAction = {};
userAction.doReset = () => {
    var newState = {};
    G.events.trigger('state.send', [newState]);
    // Fake the it being received to update state
    G.events.trigger('state.received', [newState]);
}

userAction.doFileLoad = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
        const data = JSON.parse(e.target.result);
        if (data.magic === 'BP_Scenario') {
            G.events.trigger('state.send', [data.state]);
            G.events.trigger('state.received', [data.state]);
        } else {
            alert('File is not a scenario file');
        }
    }
    reader.readAsText(file);
}

userAction.doFileSave = (file) => {
    const output = G.codec.serialize({
        magic: 'BP_Scenario',
        state: G.codec.serialize(gui.getState())
    });
    var b = new Blob([JSON.stringify(output)], {type: 'application/octet-stream'});

    var anchor = document.createElement('a');
    anchor.download = "BP_Scenario.dat";
    anchor.href = window.URL.createObjectURL(b);
    anchor.onclick = (e) => {
        setTimeout(() => window.URL.revokeObjectURL(anchor.href), 1500);
    };
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
}

function setupNetContext(address) {
    const context = new net.Connection();
    context.connect(address);

    context.on('state', (data) => {
        G.events.trigger('state.received', [data.state]);
    });

    context.on('key-set', (data) => {
        const key = data.key;
        const value = data.value;
        G.events.trigger('remote.object.updated', [{oid: key, object: value}]);
    });

    context.on('key-delete', (data) => {
        const key = data.key;
        G.events.trigger('remote.object.updated', [{oid: key, object: null}]);
    });

    context.on('transient', (data) => {
        const subType = data['sub-type'];
        if (data['sub-type'] === 'pointing') {
            G.events.trigger('remote.pointing', [data]);
            return;
        }
        console.log(`Unhandled transient type '${subType}'`);
    });

    let isConnected = false;
    const updateStatusElem = (e) => {
        const elem = document.getElementById('connection-status');
        const isOk = context.isConnected();
        elem.style.color = isOk ? 'green' : 'red';
        let text = context.status;
        if (isOk) {
            text += ' to room \'' + G.currentRoom + '\'';
        }
        elem.textContent = text;
        if (isConnected && context.status === net.STATUS.DISCONNECTED) {
            const MDCSnackbar = mdc.snackbar.MDCSnackbar;
            const snackbar = new MDCSnackbar(document.querySelector('.mdc-snackbar'));
            snackbar.show({message: 'Connection lost'});    
        }
        isConnected = context.isConnected();
    };
    context.on('status', (e) => updateStatusElem());
    context.on('room-join-success', (e) => {
        G.currentRoom = e['room-name'];
        updateStatusElem();
        G.client.id = e['client-id'];
    });
    updateStatusElem();

    return context;
}

var hostname = window.location.hostname || "localhost";
var socketAddress = "ws://" + hostname + ":8020/";
G.netContext = setupNetContext(socketAddress)

gui.initHandling();

