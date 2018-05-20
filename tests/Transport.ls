/**
 * @package Detox transport
 * @author  Nazar Mokrynskyi <nazar@mokrynskyi.com>
 * @license 0BSD
 */
crypto	= require('crypto')
lib		= require('..')
test	= require('tape')

test('Transport', (t) !->
	t.plan(10)

	initiator_id	= Buffer.from('foo')
	responder_id	= Buffer.from('bar')
	transport		= lib.Transport([], 5, 10, 30)
		.once('signal', (peer_id, signal) !->
			t.same(peer_id, responder_id, 'Got signal for responder')

			transport.create_connection(false, initiator_id)
			transport.signal(initiator_id, signal)
			transport.once('signal', (peer_id, signal) !->
				t.same(peer_id, initiator_id, 'Got signal for initiator')

				transport.signal(responder_id, signal)
				connections	= 0
				done		= false
				transport
					.on('connected', !->
						++connections
						t.pass('Connected #' + connections)

						if connections == 2
							generated_command	= 5
							generated_data		= crypto.randomBytes(20)
							transport.send(responder_id, generated_command, generated_data)
							transport.once('data', (, command, data) !->
								t.equal(command, generated_command, 'Got correct command from initiator')
								t.equal(data.length, generated_data.length, 'Got correct data length from initiator')
								t.same(Buffer.from(data), generated_data, 'Got correct data from initiator')

								generated_command	:= 25
								generated_data		:= crypto.randomBytes(20)
								transport.send(initiator_id, generated_command, generated_data)
								transport.once('data', (, command, data) !->
									t.equal(command, generated_command, 'Got correct command from responder')
									t.equal(data.length, generated_data.length, 'Got correct data length from responder')
									t.same(Buffer.from(data), generated_data, 'Got correct data from responder')

									done := true
									transport.destroy()
								)
							)
					)
					.on('disconnected', !->
						t.fail('Disconnected')
					)
			)
		)
	transport.create_connection(true, responder_id)
)