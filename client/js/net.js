
const notifyError = (errorMessage) => {
    console.log(errorMessage);
};

const misuse = (reason) => {
    const message = 'MISUSE: ' + reason;
    notifyError(message);
};

export const STATUS = {
      DISCONNECTED: 'Disconnected'
    , CONNECTED: 'Connected'
    , ERROR: 'Error'
    , CONNECTING: 'Connecting'
};


export class Connection extends EventEmitter {
    constructor() {
        super();
        this.socket = null;
        this.address = null;
        this._status = STATUS.DISCONNECTED;
        this._closeReason = undefined;
        this.handlers = Object.create(null);
        this._setupHandlers();
    }

    _setupHandlers() {

        const forward = type => {
            this.handlers[type] = msg => this.trigger(type, [msg]);
        };

        /* 
            Room state management
            
                Messages might also contain:
                    source-client-id --- id of client who made change

                state: value
                set-key: key, value
                delete-key: key
        */
        forward('state');
        forward('key-set');
        forward('key-delete');

        /*
            Room management

                room-created: name 
                room-join-success: room-name, client-id, clients{name: ..., cid: ... }  -- your assigned client id
                room-join-failed: room-name, reason
                room-client-join: room-name, client-id, client-name  -- joining client's id
                room-client-leave: room-name, client-id, client-name -- leaving client's id
                room-closed: name, reason
        */
        forward('room-created');
        forward('room-join-success');
        forward('room-join-failed');
        forward('room-client-join');
        forward('room-client-leave');
        forward('room-closed');

        /*
            Misc management

                text-message: text, client-id
                transient: ...data
                    subtypes:
                        pointing
                            pos
                            client-id
        */
        forward('transient');
    }

    _changeStatus(newStatus) {
        this._status = newStatus;
        this.trigger('status', [{
            type: 'status',
            status: this._status
        }]);
    }

    _addSocketEvents() {
        const socket = this.socket;

        socket.onopen = (event) => {
            this._changeStatus(STATUS.CONNECTED);
        }

        socket.onmessage = (event) => {           
            var msg = undefined;
            try {
                msg = JSON.parse(event.data);
            }
            catch (err) {
                this.trigger('malformed-message', [{
                    message: msg
                }]);
                return;
            }
            try {
                var handler = this.handlers[msg.type];
                if (handler) {
                    handler(msg);
                    return;
                } else {
                    this.trigger('bad-message', [{
                        type: 'error',
                        'message-type': msg.type,
                        message: "Unknown messsage type '" + msg.type + "'"
                    }]);
                }
            } catch (err) {
                this.trigger('internal-error', [{
                    type: 'error',
                    message: err.toString()
                }]);
                return;
            }
        };

        socket.onclose = (event) => {
            this._closeReason = event.reason;
            this._changeStatus(STATUS.DISCONNECTED);
        };

        socket.onerror = (event) => {
            this._changeStatus(STATUS.ERROR);
        };
    }

    get status() {
        return this._status;
    }

    isConnected() {
        return this._status === STATUS.CONNECTED;
    }

    connect(address) {
        if (this._status !== 'DISCONNECTED') {
            misuse('Connection is open or attempting to open');
        }
        this.address = address;
        this.socket = new WebSocket(this.address);
        this._addSocketEvents();
        this._changeStatus(STATUS.CONNECTING);
    }

    close() {
        this.socket.close();
        this.socket = null;
    }

    send(data) {
        const socket = this.socket;
        if (socket.readyState === 1) {
            socket.send(JSON.stringify(data));    
        } else {
            misuse("Misuse. Socket not ready to send");
        }
    }
}