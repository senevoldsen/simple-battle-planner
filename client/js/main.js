import {Map} from './map.js';
import * as net from './net.js';
import * as gui from './gui.js';
import * as guiOrder from './gui.order.js';
import * as testLeaflet from './leaflet/movesegment.js';

/*
TODO: Try to move modify symbol dialog into html instead.
CONSIDER: different detail level depending on map zoom.

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

const G = window.G = {};

G.bpMap = new Map(mapConfigs.taunus);

// Construct Leaflet items

const mapCenter = new L.latLng(G.bpMap.gameToMap([G.bpMap.constants.gameWidth / 2, G.bpMap.constants.gameHeight / 2]));
const mapBounds = L.latLngBounds([
    new L.latLng(G.bpMap.gameToMap(G.bpMap.constants.lowerLeftPos)),
    new L.latLng(G.bpMap.gameToMap(G.bpMap.constants.upperRightPos))
]);

G.leafMap = L.map('bp_map', {
    crs: L.CRS.Simple,
    minZoom: G.bpMap.info.minZoom,
    maxZoom: G.bpMap.info.maxZoom,
    zoom: -3
});

G.leafMap.setView(mapCenter, G.bpMap.info.minZoom + 5);
G.leafMap.fitBounds(mapBounds.pad(-0.2));

const tileSize = G.bpMap.info.tileSize || 256;
const tileLayer = L.tileLayer(G.bpMap.info.tilePrefix + 'z{z}/image_{x}_{y}.jpg', {
    minZoom: G.bpMap.info.minZoom,
    maxZoom: G.bpMap.info.maxZoom,
    maxNativeZoom: G.bpMap.info.maxZoom,
    continuousWorld: true,
    bounds: mapBounds,
    tileSize: tileSize
}).addTo(G.leafMap);

G.axisLayer = L.layerGroup().addTo(G.leafMap);
G.markerLayer = L.layerGroup().addTo(G.leafMap);

// Wire state events together
G.events = new EventEmitter();

function setupGuiEvents() {
    G.events.on('gui.object.created', (object) => {
        G.netContext.send({type: 'key-set', key: object.oid, value: object});
    });

    G.events.on('gui.object.deleted', (object) => {
        G.netContext.send({type: 'key-delete', key: object.oid});
    });

    G.events.on('gui.object.updated', (object) => {
        G.netContext.send({type: 'key-set', key: object.oid, value: object});
    });

    G.events.on('state.received', (remoteState) => {
        gui.processState(remoteState);
    });

    G.events.on('state.send', (state) => {
        G.netContext.send({
            type: 'state',
            value: state
        });
    });

    G.events.on('remote.object.updated', (data) => {
        gui.processObject(data.oid, data.object);
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
    const output = {
        magic: 'BP_Scenario',
        state: gui.getState()
    }
    var uriContent = "data:application/octet-stream," + encodeURIComponent(JSON.stringify(output));
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

    context.on('state', (state) => {
        G.events.trigger('state.received', [state]);
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

    const updateStatusElem = (e) => {
        const elem = document.getElementById('connection-status');
        elem.style.color = context.isConnected() ? 'green' : 'red';
        elem.textContent = context.status;
    };
    context.on('status', (e) => updateStatusElem());
    updateStatusElem();

    return context;
}

var hostname = window.location.hostname || "localhost";
var socketAddress = "ws://" + hostname + ":8020/";
G.netContext = setupNetContext(socketAddress)

gui.initHandling();
