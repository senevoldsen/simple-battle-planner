
const TYPE_KEY = '__type__';

export class DictionaryCodec {

    constructor() {
        this._deserializers = Object.create(null);
    }

    addDeserializer(type, deserializer) {
        this._deserializers[type] = deserializer;
    }

    store(key, value) {
        this.current[key] = this._encode(value);
    }

    get(key, def) {
        const value = this.current[key];
        return value === undefined ? def : this._decode(value);
    }

    serialize(value) {
        return this._encode(value);
    }

    deserialize(value) {
        return this._decode(value);
    }

    _encode(value) {
        const jsType = typeof value;
        if (Array.isArray(value)) {
            return value.map(x => this._encode(x));
        } else if (jsType === 'object') {
            const result = {};
            const hasSerialize = 'serialize' in value && typeof value['serialize'] === 'function';
            if (hasSerialize) {
                // Serialize in fresh context
                result[TYPE_KEY] = value.constructor.name;
                const origCurrent = this.current;
                this.current = result;
                value.serialize(this);
                this.current = origCurrent;
            } else {
                Object.entries(value).forEach(([k, v]) => result[k] = this._encode(v));
            }
            return result;
        } else {
            return value;
        }
        throw 'Unhandled encoding';
    }

    _decode(value) {
        const jsType = typeof value;
        if (Array.isArray(value)) {
            return value.map(x => this._decode(x));
        } else if (jsType === 'object') {
            const result = {};
            const hasDeserialize = TYPE_KEY in value;
            if (hasDeserialize) {
                const deserializer = this._deserializers[value[TYPE_KEY]];
                if (!deserializer) {
                    throw 'Missing deserializer';
                }
                // Deserialize with value as context
                const origCurrent = this.current;
                this.current = value;
                const realResult = deserializer(this);
                this.current = origCurrent;
                return realResult;
            } else {
                Object.entries(value).forEach(([k, v]) => result[k] = this._decode(v));
            }
            return result;
        }
        else {
            return value;
        }
        throw 'Unhandled encoding';
    }
}
