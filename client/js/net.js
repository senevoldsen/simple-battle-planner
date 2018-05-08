
(function (BP) {

    var net;
    BP.net = net = {};

    net.connect = function(address) {
        var socket = new WebSocket(address);
        // Abnormal termination might only leave reason when closing and not in error event.
        var closeReason = '';

        // We inherit from the event emitter
        var context = Object.create(new EventEmitter());

        socket.onopen = function (event) {
            context.trigger('connection', ['CONNECTED']);
        };

        var handlers = Object.create(null);

        /* 
            Room state management
            
                Messages might also contain:
                    source-client-id --- id of client who made change

                state: value
                set-key: key, value
                delete-key: key
        */
        handlers['state'] = (msg) => context.trigger('state', [msg.value]);
        handlers['key-set'] = (msg) => context.trigger('key-set', [msg]);
        handlers['key-delete'] = (msg) => context.trigger('key-delete', [msg]);

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

        socket.onmessage = function(event) {           
            var msg = JSON.parse(event.data);
            try {
                var handler = handlers[msg.type];
                if (handler) {
                    handler(msg);
                    return;
                } else {
                    context.trigger('error', [{
                        code: 'ERR_UNKNOWN_MESSAGE',
                        message: "Unknown messsage type '" + msg.type + "'"
                    }]);
                }
            } catch (err) {
                context.trigger('error', [{
                    code: 'ERR_BAD_MESSAGE',
                    message: err.toString()
                }]);
            }
        };

        socket.onclose = function(event) {
            closeReason = event.reason;
            console.log(["onclose", event]);
            context.trigger('connection', ['CLOSED']);
        };

        socket.onerror = function(event) {
            context.trigger('error', [{
                code: 'ERR_CONNECTION',
                message: closeReason
            }]);
        };

        context.send = function(data) {
            if (socket.readyState === 1) {
                socket.send(JSON.stringify(data));    
            } else {
                console.log("Misuse. Socket not ready to send");
            }
        }

        return context;
    };

})(window.BP = window.BP || {});
