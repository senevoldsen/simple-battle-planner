import * as gui from './gui.js';
import {PolyArrow} from './leaflet/movesegment.js';

export class MoveOrder {
    constructor(from, to, color, text="") {
        this.from = from;
        this.to = to;
        this.color = color;
        this.text = text;
        this._guiState = {};
    }

    serialize(encoder) {
        encoder.store('from', this.from);
        encoder.store('to', this.to);
        encoder.store('color', this.color);
        encoder.store('text', this.text);
    }

    static deserialize(decoder) {
        return new MoveOrder(
            decoder.get('from'),
            decoder.get('to'),
            decoder.get('color'),
            decoder.get('text')
        );
    }

    updateGui() {
        this.removeFromGui();
        const mapFrom = G.bpMap.gameToMap(this.from);
        const mapTo = G.bpMap.gameToMap(this.to);

        const layer = new PolyArrow([mapFrom, mapTo], {
            color: this.color,
            text: this.text
        });
        this._guiState.layer = layer;
        layer.addTo(G.markerLayer);
    }

    removeFromGui() {
        if (this._guiState.layer) {
            G.markerLayer.removeLayer(this._guiState.layer);
            this._guiState.layer = null;
        }
    }
}
