"""Manages a single room"""

import collections
import asyncio
import json
import copy
import logging

log = logging.getLogger('BP_SERVER')


def log_method_call(func):
    def wrapped(self, *args, **kwargs):
        global log
        log.debug('%s called with args=%s and kwargs=%s', func.__name__, args, kwargs)
        func(self, *args, **kwargs)
    return wrapped


class Room(object):
    """A room for collaboration"""
    def __init__(self, name, persist=False):
        super(Room, self).__init__()
        self.name = name
        self.clients = collections.OrderedDict()
        self.state = collections.OrderedDict()
        self.went_empty_time = 0 # Will be used to plan for deletions
        self.persist = persist

    @log_method_call
    def member_join(self, client):
        self.clients[client.cid] = client
        join_msg = {
            'type': 'client-join',
            'name': client.name
        }
        self._broadcast_message(join_msg, exclude=client)
        approve_msg = {
            'type': 'room-joined',
            'name': self.name
        }
        self._send_message(client, approve_msg)
        self.send_state(client)

    @log_method_call
    def member_leave(self, client):
        self.clients.pop(client.cid, 'IGNORED')
        if len(self.clients) == 0:
            pass  # TODO: Update went_empty_time

    @log_method_call
    def send_state(self, client):
        state_msg = {
            'type': 'state',
            'value': copy.deepcopy(self.state)
        }
        self._send_message(client, state_msg)

    @log_method_call
    def force_set_state(self, state, exclude=None):
        self.state = state
        excludes = self._make_exclude_set(exclude)
        for client in self.clients.values():
            if client not in excludes:
                self.send_state(client)

    @log_method_call
    def set_key(self, client, key, value):
        message = {
            'type': 'key-set',
            'key': key,
            'value': value
        }
        self._broadcast_message(message, exclude=client)
        self.state[key] = value

    @log_method_call
    def delete_key(self, client, key):
        message = {
            'type': 'key-delete',
            'key': key
        }
        self.state.pop(key, 'IGNORED')
        self._broadcast_message(message, exclude=client)

    @log_method_call
    def send_text(self, text, exclude=None):
        message = {
            'type': 'text-message',
            'text': '%s said: %s' % (from_client.name, text)
        }
        self._broadcast_message(text, exclude)

    def _make_exclude_set(self, exclude=None):
        if exclude is None:
            excludes = set([])
        elif isinstance(exclude, collections.Iterable):
            excludes = set(exclude)
        else:
            excludes = set([exclude])
        return excludes

    def _send_message(self, client, message):
        client.queue_message(message)

    def _broadcast_message(self, message, exclude=None):
        """Typical use of exclude will be the original sender"""
        excludes = self._make_exclude_set(exclude)
        for client in self.clients.values():
            if client not in excludes:
                self._send_message(client, message)
