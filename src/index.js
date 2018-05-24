// Generated by LiveScript 1.5.0
/**
 * @package Detox transport
 * @author  Nazar Mokrynskyi <nazar@mokrynskyi.com>
 * @license 0BSD
 */
(function(){
  var MAX_DATA_SIZE, MAX_COMPRESSED_DATA_SIZE, PACKET_SIZE;
  MAX_DATA_SIZE = Math.pow(2, 16) - 2;
  MAX_COMPRESSED_DATA_SIZE = MAX_DATA_SIZE - 1;
  PACKET_SIZE = 512;
  /**
   * @param {!Array<!Uint8Array>}	buffer
   * @param {!Uint8Array}			new_array
   */
  function update_dictionary_buffer(buffer, new_array){
    buffer[0] = buffer[1];
    buffer[1] = buffer[2];
    buffer[2] = buffer[3];
    buffer[3] = buffer[4];
    buffer[4] = new_array;
  }
  /**
   * @param {!Object=} wrtc
   */
  function Wrapper(detoxUtils, fixedSizeMultiplexer, asyncEventer, pako, simplePeer, wrtc){
    var array2string, string2array, concat_arrays, error_handler, ArrayMap, timeoutSet, empty_array;
    array2string = detoxUtils['array2string'];
    string2array = detoxUtils['string2array'];
    concat_arrays = detoxUtils['concat_arrays'];
    error_handler = detoxUtils['error_handler'];
    ArrayMap = detoxUtils['ArrayMap'];
    timeoutSet = detoxUtils['timeoutSet'];
    empty_array = new Uint8Array(0);
    /**
     * @constructor
     *
     * @param {!Uint8Array}		id								Own ID
     * @param {!Uint8Array}		peer_id							ID of a peer
     * @param {boolean}			initiator
     * @param {!Array<!Object>}	ice_servers
     * @param {number}			packets_per_second				Each packet send in each direction has exactly the same size and packets are sent at fixed rate (>= 1)
     * @param {number}			uncompressed_commands_offset	Commands with number less than this will be compressed/decompressed with zlib
     *
     * @return {!P2P_transport}
     */
    function P2P_transport(id, peer_id, initiator, ice_servers, packets_per_second, uncompressed_commands_offset){
      if (!(this instanceof P2P_transport)) {
        return new P2P_transport(id, peer_id, initiator, ice_servers, packets_per_second, uncompressed_commands_offset);
      }
      asyncEventer.call(this);
      this._id = id;
      this._peer_id = peer_id;
      this._ice_servers = ice_servers;
      this._uncompressed_commands_offset = uncompressed_commands_offset;
      this._send_delay = 1000 / packets_per_second;
      this._multiplexer = fixedSizeMultiplexer['Multiplexer'](MAX_DATA_SIZE, PACKET_SIZE);
      this._demultiplexer = fixedSizeMultiplexer['Demultiplexer'](MAX_DATA_SIZE, PACKET_SIZE);
      this._send_zlib_buffer = [empty_array, empty_array, empty_array, empty_array, empty_array];
      this._receive_zlib_buffer = [empty_array, empty_array, empty_array, empty_array, empty_array];
      this._init_peer(initiator);
    }
    P2P_transport.prototype = {
      /**
       * @param {boolean} initiator
       */
      _init_peer: function(initiator){
        var old_instance, instance, x$, this$ = this;
        if (this._connected) {
          return;
        }
        this._initiator = initiator;
        this._sending = initiator;
        this._signal_received = false;
        old_instance = this._peer;
        instance = simplePeer({
          'config': {
            'iceServers': this._ice_servers
          },
          'initiator': initiator,
          'trickle': false,
          'wrtc': wrtc
        });
        this._peer = instance;
        x$ = instance;
        x$['once']('signal', function(signal){
          if (this$._destroyed || this$._peer !== instance) {
            return;
          }
          this$['fire']('signal', concat_arrays([[initiator ? 1 : 0], string2array(signal['sdp'])]));
        });
        x$['once']('connect', function(){
          if (this$._destroyed || this$._peer !== instance) {
            return;
          }
          this$['fire']('connected');
          this$['off']('signal');
          this$._connected = true;
          this$._last_sent = +new Date;
          if (this$._sending) {
            this$._real_send();
          }
        });
        x$['once']('close', function(){
          if (this$._peer !== instance) {
            return;
          }
          this$['fire']('disconnected');
          this$['destroy']();
        });
        x$['on']('data', function(data){
          var demultiplexed_data, command, command_data;
          if (this$._destroyed) {
            return;
          }
          if (this$._sending || data.length !== PACKET_SIZE) {
            this$['destroy']();
          } else {
            this$._demultiplexer['feed'](data);
            while (this$._demultiplexer['have_more_data']()) {
              demultiplexed_data = this$._demultiplexer['get_data']();
              command = demultiplexed_data[0];
              command_data = demultiplexed_data.subarray(1);
              if (command < this$._uncompressed_commands_offset) {
                command_data = this$._zlib_decompress(command_data);
              }
              this$['fire']('data', command, command_data);
            }
            this$._sending = true;
            this$._real_send();
          }
        });
        x$['on']('error', error_handler);
        if (old_instance) {
          old_instance['destroy']();
        }
      }
      /**
       * @param {!Uint8Array} signal As generated by `signal` event
       */,
      'signal': function(signal){
        var offer, i$, ref$, len$, key, item;
        if (this._destroyed || this._signal_received) {
          return;
        }
        this._signal_received = true;
        offer = Boolean(signal[0]);
        if (offer === this._initiator) {
          for (i$ = 0, len$ = (ref$ = this._id).length; i$ < len$; ++i$) {
            key = i$;
            item = ref$[i$];
            if (item === this._peer_id[key]) {
              continue;
            }
            if (item > this._peer_id[key]) {
              return;
            } else {
              this._init_peer(false);
              break;
            }
          }
        }
        this._peer['signal']({
          'type': this._initiator ? 'answer' : 'offer',
          'sdp': array2string(signal.subarray(1))
        });
      },
      'update_peer_id': function(peer_id){
        this._peer_id = peer_id;
      }
      /**
       * @param {number}		command
       * @param {!Uint8Array}	data
       */,
      'send': function(command, data){
        var data_with_header;
        if (this._destroyed || data.length > MAX_DATA_SIZE) {
          return;
        }
        if (command < this._uncompressed_commands_offset) {
          if (data.length > MAX_COMPRESSED_DATA_SIZE) {
            return;
          }
          data = this._zlib_compress(data);
        }
        data_with_header = concat_arrays([[command], data]);
        this._multiplexer['feed'](data_with_header);
      },
      'destroy': function(){
        if (this._destroyed) {
          return;
        }
        this._destroyed = true;
        clearTimeout(this._timeout);
        this._peer['destroy']();
      }
      /**
       * Send a block of multiplexed data to the other side
       */,
      _real_send: function(){
        var delay, this$ = this;
        delay = Math.max(0, this._send_delay - (new Date - this._last_sent));
        this._timeout = setTimeout(function(){
          if (this$._destroyed) {
            return;
          }
          try {
            this$._peer['send'](this$._multiplexer['get_block']());
            this$._sending = false;
            this$._last_sent = +new Date;
          } catch (e$) {}
        }, delay);
      }
      /**
       * @param {!Uint8Array} data
       *
       * @return {!Uint8Array}
       */,
      _zlib_compress: function(data){
        var result;
        result = pako['deflate'](data, {
          'dictionary': concat_arrays(this._send_zlib_buffer),
          'level': 1
        });
        update_dictionary_buffer(this._send_zlib_buffer, data);
        if (result.length > MAX_COMPRESSED_DATA_SIZE) {
          return concat_arrays([[0], data]);
        } else {
          return concat_arrays([[1], result]);
        }
      }
      /**
       * @param {!Uint8Array} data
       *
       * @return {!Uint8Array}
       */,
      _zlib_decompress: function(data){
        var compressed, result;
        compressed = data[0];
        data = data.subarray(1);
        if (compressed) {
          result = pako['inflate'](data, {
            'dictionary': concat_arrays(this._receive_zlib_buffer)
          });
        } else {
          result = data;
        }
        update_dictionary_buffer(this._receive_zlib_buffer, result);
        return result;
      }
    };
    P2P_transport.prototype = Object.assign(Object.create(asyncEventer.prototype), P2P_transport.prototype);
    Object.defineProperty(P2P_transport.prototype, 'constructor', {
      value: P2P_transport
    });
    /**
     * @constructor
     *
     * @param {!Uint8Array}		id								Own ID
     * @param {!Array<!Object>}	ice_servers
     * @param {number}			packets_per_second				Each packet send in each direction has exactly the same size and packets are sent at fixed rate (>= 1)
     * @param {number}			uncompressed_commands_offset	Commands with number less than this will be compressed/decompressed with zlib
     * @param {number}			connect_timeout					How many seconds since `signal` generation to wait for connection before failing
     *
     * @return {!Transport}
     */
    function Transport(id, ice_servers, packets_per_second, uncompressed_commands_offset, connect_timeout){
      if (!(this instanceof Transport)) {
        return new Transport(id, ice_servers, packets_per_second, uncompressed_commands_offset, connect_timeout);
      }
      asyncEventer.call(this);
      this._id = id;
      this._pending_connections = ArrayMap();
      this._connections = ArrayMap();
      this._timeouts = new Set;
      this._ice_servers = ice_servers;
      this._packets_per_second = packets_per_second;
      this._uncompressed_commands_offset = uncompressed_commands_offset;
      this._connect_timeout = connect_timeout;
      this._connection_to_id_map = new WeakMap;
    }
    Transport.prototype = {
      /**
       * @param {boolean}		initiator
       * @param {!Uint8Array}	peer_id
       *
       * @return {P2P_transport}
       */
      'create_connection': function(initiator, peer_id){
        var connection, this$ = this;
        if (this._destroyed) {
          return null;
        }
        connection = this._pending_connections.get(peer_id) || this._connections.get(peer_id);
        if (connection) {
          return connection;
        }
        connection = P2P_transport(this._id, peer_id, initiator, this._ice_servers, this._packets_per_second, this._uncompressed_commands_offset)['on']('data', function(command, command_data){
          var peer_id;
          if (this$._destroyed) {
            return;
          }
          peer_id = this$._connection_to_id_map.get(connection);
          this$['fire']('data', peer_id, command, command_data);
        })['once']('signal', function(signal){
          var peer_id;
          if (this$._destroyed) {
            return;
          }
          peer_id = this$._connection_to_id_map.get(connection);
          this$['fire']('signal', peer_id, signal);
          this$._timeout(connection, 'connected');
        })['once']('connected', function(){
          var peer_id;
          peer_id = this$._connection_to_id_map.get(connection);
          if (this$._destroyed || !this$._pending_connections.has(peer_id)) {
            return;
          }
          this$._pending_connections['delete'](peer_id);
          this$._connections.set(peer_id, connection);
          this$['fire']('connected', peer_id);
        })['once']('disconnected', function(){
          var peer_id;
          if (this$._destroyed) {
            return;
          }
          peer_id = this$._connection_to_id_map.get(connection);
          this$._pending_connections['delete'](peer_id);
          this$._connections['delete'](peer_id);
          this$['fire']('disconnected', peer_id);
        });
        this._connection_to_id_map.set(connection, peer_id);
        this._timeout(connection, 'signal');
        this._pending_connections.set(peer_id, connection);
        return connection;
      }
      /**
       * @param {!Uint8Array} peer_id
       *
       * @return {P2P_transport}
       */,
      'has_connection': function(peer_id){
        return this._pending_connections.get(peer_id) || this._connections.get(peer_id) || null;
      }
      /**
       * @param {!Uint8Array}	old_peer_id
       * @param {!Uint8Array}	new_peer_id
       *
       * @return {boolean}
       */,
      'update_peer_id': function(old_peer_id, new_peer_id){
        var connection;
        if (this._pending_connections.has(new_peer_id) || this._connections.has(new_peer_id)) {
          return false;
        }
        connection = this._pending_connections.get(old_peer_id);
        if (connection) {
          this._connection_to_id_map.set(connection, new_peer_id);
          this._pending_connections['delete'](old_peer_id);
          this._pending_connections.set(new_peer_id, connection);
          connection['update_peer_id'](new_peer_id);
          return true;
        }
        connection = this._connections.get(old_peer_id);
        if (connection) {
          this._connection_to_id_map.set(connection, new_peer_id);
          this._connections['delete'](old_peer_id);
          this._connections.set(new_peer_id, connection);
          connection['update_peer_id'](new_peer_id);
          return true;
        }
        return false;
      }
      /**
       * @param {!P2P_transport} connection
       */,
      _timeout: function(connection, event){
        var timeout, this$ = this;
        timeout = timeoutSet(this._connect_timeout, function(){
          connection['destroy']();
        });
        this._timeouts.add(timeout);
        connection['once'](event, function(){
          this$._timeouts['delete'](timeout);
          clearTimeout(timeout);
        });
      }
      /**
       * @param {!Uint8Array} peer_id
       */,
      'destroy_connection': function(peer_id){
        var connection;
        connection = this._pending_connections.get(peer_id) || this._connections.get(peer_id);
        if (connection) {
          connection['destroy']();
        }
      }
      /**
       * @param {!Uint8Array} peer_id
       * @param {!Uint8Array} signal
       */,
      'signal': function(peer_id, signal){
        var connection;
        if (this._destroyed) {
          return;
        }
        connection = this._pending_connections.get(peer_id);
        if (connection) {
          connection['signal'](signal);
        }
      }
      /**
       * @param {!Uint8Array}	peer_id
       * @param {number}		command
       * @param {!Uint8Array}	command_data
       */,
      'send': function(peer_id, command, command_data){
        var connection;
        if (this._destroyed) {
          return;
        }
        connection = this._connections.get(peer_id);
        if (connection) {
          connection['send'](command, command_data);
        }
      },
      'destroy': function(){
        if (this._destroyed) {
          return;
        }
        this._destroyed = true;
        this._pending_connections.forEach(function(connection){
          connection['destroy']();
        });
        this._connections.forEach(function(connection){
          connection['destroy']();
        });
        this._timeouts.forEach(function(timeout){
          clearTimeout(timeout);
        });
      }
    };
    Transport.prototype = Object.assign(Object.create(asyncEventer.prototype), Transport.prototype);
    Object.defineProperty(Transport.prototype, 'constructor', {
      value: Transport
    });
    return {
      'P2P_transport': P2P_transport,
      'Transport': Transport,
      'MAX_DATA_SIZE': MAX_DATA_SIZE,
      'MAX_COMPRESSED_DATA_SIZE': MAX_COMPRESSED_DATA_SIZE
    };
  }
  if (typeof define === 'function' && define['amd']) {
    define(['@detox/utils', 'fixed-size-multiplexer', 'async-eventer', 'pako', '@detox/simple-peer'], Wrapper);
  } else if (typeof exports === 'object') {
    module.exports = Wrapper(require('@detox/utils'), require('fixed-size-multiplexer'), require('async-eventer'), require('pako'), require('@detox/simple-peer'), require('wrtc'));
  } else {
    this['detox_transport'] = Wrapper(this['detox_utils'], this['fixed_size_multiplexer'], this['async_eventer'], this['pako'], this['SimplePeer']);
  }
}).call(this);
