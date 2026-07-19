'use strict';

importScripts('./zeknova-adapter.js', './azl-engine.js');

self.onmessage = function (event) {
  var message = event.data || {}, id = message.id;
  try {
    var adapter = self.AZL_ADAPTER;
    var engine = self.AZL && self.AZL.StrategicEngine;
    if (!adapter || !engine) throw new Error('AZL worker dependencies did not initialize.');
    var result = engine.search(adapter, message.state, message.options || {});
    self.postMessage({ id: id, result: result });
  } catch (error) {
    self.postMessage({ id: id, error: String(error && error.message || error) });
  }
};
