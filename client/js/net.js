
(function (BP) {

    notifyError = (errorMessage) => {
        console.log(errorMessage);
    }

    misuse = (reason) => {
        const message = 'MISUSE: ' + reason;
        notifyError(message);
    }

    class Connection extends EventEmitter {
        constructor() {
            super();
            this.socket = null;
            this.address = null;
            this._status = 'DISCONNECTED';
            this._closeReason = undefined;
            this.handlers = Object.create(null);
            this._setupHandlers();
        }

        _setupHandlers() {
            /* 
                Room state management
                
                    Messages might also contain:
                        source-client-id --- id of client who made change

                    state: value
                    set-key: key, value
                    delete-key: key
            */
            this.handlers['state'] = (msg) => this.trigger('state', [msg.value]);
            this.handlers['key-set'] = (msg) => this.trigger('key-set', [msg]);
            this.handlers['key-delete'] = (msg) => this.trigger('key-delete', [msg]);

            /*
                Room management

                    room-created: name 
                    room-joined: name, client-id   --- Your assigned client-id
                    room-client-join: room-name, client-id, client-name  -- joining client's id
                    room-client-leave: room-name, client-id -- leaving client's id
                    room-closed: name, reason
            */

            /*
                Misc management

                    text-message: text, client-id
            */      
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
                this._changeStatus('CONNECTED');
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
                this._changeStatus('DISCONNECTED');
            };

            socket.onerror = (event) => {
                this._changeStatus('ERROR');
            };
        }

        get status() {
            return this._status;
        }

        isConnected() {
            return this._status === 'CONNECTED';
        }

        connect(address) {
            if (this._status !== 'DISCONNECTED') {
                misuse('Connection is open or attempting to open');
            }
            this.address = address;
            this.socket = new WebSocket(this.address);
            this._addSocketEvents();
            this._changeStatus('CONNECTING');
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

    BP.net = {
        Connection: Connection
    };

})(window.BP = window.BP || {});
