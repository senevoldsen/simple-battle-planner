import {vector} from '../vector.js';
import * as leafSVG from './svg-marker.js';

export var SmoothFreehand = leafSVG.SvgMarker.extend({

    options: {
          color: 'red'
        , text: ''
        , width: 150
        , strokeWidth: 20
        , minStrokeWidth: 4
        , defaultZoom: 0
        , opacity: 0.6
        , padding: 0.1
        , pane: 'overlayPane'
    },

    initialize: function (latLngs, options) {
        leafSVG.SvgMarker.prototype.initialize.call(this, options);
        L.Util.setOptions(this, options);
        L.Util.stamp(this);
        this.setLatLngs(latLngs);
    },

    setLatLngs: function (latLngs) {
        this._latLngs = latLngs.map((x) => new L.latLng(x));
        if (this._map) {
            this._reset();
            this._updateTransform();    
        }
    },
    
    getLatLngs: function () {
        return Array.from(this._latLngs);
    },

    setText: function (text) {
        this.options.text = text;
        this._reset();
    },

    getText: function () {
        return this.options.text;
    },

    onAdd: function (map) {
        leafSVG.SvgMarker.prototype.onAdd.call(this, map);
        this._pathElem = leafSVG.createSvgElem('path');        
        this._gElem.appendChild(this._pathElem);
        this._reset();

        this.on('contextmenu', (e) => {
            const numPoints = this._latLngs.length;
            if (numPoints == 0) return;
            // Extend event
            e.polyArrow = this;
            e.polyArrowEndPos = this._latLngs[numPoints-1];
            L.DomEvent.stop(e);
            this.fire('arrow-contextmenu', e);
        }); 
    },

    onRemove: function () {
        leafSVG.SvgMarker.prototype.onRemove.call(this);
        delete this._pathElem;
    }
});
