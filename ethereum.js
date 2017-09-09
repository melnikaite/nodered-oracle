module.exports = function(RED) {
  var util = require("util");
  var vm = require("vm");
  const Web3 = require("web3");

  function sendResults(node,_msgid,msgs) {
      if (msgs == null) {
          return;
      } else if (!util.isArray(msgs)) {
          msgs = [msgs];
      }
      var msgCount = 0;
      for (var m=0; m<msgs.length; m++) {
          if (msgs[m]) {
              if (!util.isArray(msgs[m])) {
                  msgs[m] = [msgs[m]];
              }
              for (var n=0; n < msgs[m].length; n++) {
                  var msg = msgs[m][n];
                  if (msg !== null && msg !== undefined) {
                      if (typeof msg === 'object' && !Buffer.isBuffer(msg) && !util.isArray(msg)) {
                          msg._msgid = _msgid;
                          msgCount++;
                      } else {
                          var type = typeof msg;
                          if (type === 'object') {
                              type = Buffer.isBuffer(msg)?'Buffer':(util.isArray(msg)?'Array':'Date');
                          }
                          node.error(RED._("function.error.non-message-returned",{ type: type }))
                      }
                  }
              }
          }
      }
      if (msgCount>0) {
          node.send(msgs);
      }
  }



    function EthereumNode(config) {
        RED.nodes.createNode(this,config);
        var node = this;

        this.name = config.name;
        this.function = config.function;
        var functionText = "var results = null;"+
                           "results = (function(msg){ "+
                              "var __msgid__ = msg._msgid;"+
                              "var node = {"+
                                 "log:__node__.log,"+
                                 "error:__node__.error,"+
                                 "warn:__node__.warn,"+
                                 "on:__node__.on,"+
                                 "status:__node__.status,"+
                                 "send:function(msgs){ __node__.send(__msgid__,msgs);}"+
                              "};\n"+
                              this.function+"\n"+
                           "})(msg);";

        var sandbox = {
            console:console,
            util:util,
            Buffer:Buffer,
            RED: {
                util: RED.util
            },
            __node__: {
                log: function() {
                    node.log.apply(node, arguments);
                },
                error: function() {
                    node.error.apply(node, arguments);
                },
                warn: function() {
                    node.warn.apply(node, arguments);
                },
                send: function(id, msgs) {
                    sendResults(node, id, msgs);
                },
                on: function() {
                    if (arguments[0] === "input") {
                        throw new Error(RED._("function.error.inputListener"));
                    }
                    node.on.apply(node, arguments);
                },
                status: function() {
                    node.status.apply(node, arguments);
                }
            },
            context: {
                set: function() {
                    node.context().set.apply(node,arguments);
                },
                get: function() {
                    return node.context().get.apply(node,arguments);
                },
                keys: function() {
                    return node.context().keys.apply(node,arguments);
                },
                get global() {
                    return node.context().global;
                },
                get flow() {
                    return node.context().flow;
                }
            },
            flow: {
                set: function() {
                    node.context().flow.set.apply(node,arguments);
                },
                get: function() {
                    return node.context().flow.get.apply(node,arguments);
                },
                keys: function() {
                    return node.context().flow.keys.apply(node,arguments);
                }
            },
            global: {
                set: function() {
                    node.context().global.set.apply(node,arguments);
                },
                get: function() {
                    return node.context().global.get.apply(node,arguments);
                },
                keys: function() {
                    return node.context().global.keys.apply(node,arguments);
                }
            },
            setTimeout: function () {
                var func = arguments[0];
                var timerId;
                arguments[0] = function() {
                    sandbox.clearTimeout(timerId);
                    try {
                        func.apply(this,arguments);
                    } catch(err) {
                        node.error(err,{});
                    }
                };
                timerId = setTimeout.apply(this,arguments);
                node.outstandingTimers.push(timerId);
                return timerId;
            },
            clearTimeout: function(id) {
                clearTimeout(id);
                var index = node.outstandingTimers.indexOf(id);
                if (index > -1) {
                    node.outstandingTimers.splice(index,1);
                }
            },
            setInterval: function() {
                var func = arguments[0];
                var timerId;
                arguments[0] = function() {
                    try {
                        func.apply(this,arguments);
                    } catch(err) {
                        node.error(err,{});
                    }
                };
                timerId = setInterval.apply(this,arguments);
                node.outstandingIntervals.push(timerId);
                return timerId;
            },
            clearInterval: function(id) {
                clearInterval(id);
                var index = node.outstandingIntervals.indexOf(id);
                if (index > -1) {
                    node.outstandingIntervals.splice(index,1);
                }
            }
        };
        var context = vm.createContext(sandbox);

        try {
            this.script = vm.createScript(functionText);
            // console.log(functionText);
            this.on("input", function(msg) {
                try {
                  const web3 = new Web3(config.host);
                  const contractInstance = new web3.eth.Contract(
                    JSON.parse(config.abi),
                    config.address
                  );

                    context.msg = msg;
                    context.msg.contractInstance = contractInstance;
                    this.script.runInContext(context);
                    sendResults(this,msg._msgid,context.results);


                } catch(err) {

                    var line = 0;
                    var errorMessage;
                    var stack = err.stack.split(/\r?\n/);
                    if (stack.length > 0) {
                        while (line < stack.length && stack[line].indexOf("ReferenceError") !== 0) {
                            line++;
                        }

                        if (line < stack.length) {
                            errorMessage = stack[line];
                            var m = /:(\d+):(\d+)$/.exec(stack[line+1]);
                            if (m) {
                                var lineno = Number(m[1])-1;
                                var cha = m[2];
                                errorMessage += " (line "+lineno+", col "+cha+")";
                            }
                        }
                    }
                    if (!errorMessage) {
                        errorMessage = err.toString();
                    }
                    this.error(errorMessage, msg);
                }
            });
        } catch(err) {
            // eg SyntaxError - which v8 doesn't include line number information
            // so we can't do better than this
            this.error(err);
        }
    }
    RED.nodes.registerType("ethereum", EthereumNode);
}
