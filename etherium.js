module.exports = function(RED) {
    function EtheriumNode(config) {
        RED.nodes.createNode(this,config);
        var node = this;
        node.on('input', function(msg) {
            msg.payload = msg.payload.toLowerCase();
            node.send(msg);
            // this.send([ msg1 , msg2 ]);
        });
    }
    RED.nodes.registerType("etherium",EtheriumNode);
}
