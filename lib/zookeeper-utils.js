var zkClient = require('node-zookeeper-client');

var logger = null;

function zkConnectAndExecute(dto, callback) {
    if (!dto) {
        return callback(new Error('Missing DTO'));
    }

    var client = zkClient.createClient(dto.zkConnectionString, dto.zkOptions);
    client.once('connected', function () {
        callback(null, client);
        client.close();
    });
    client.connect();
}

function zkExistsPath(dto, path, callback) {
    zkConnectAndExecute(dto, function (err, client) {
        if (err) {
            return callback(err);
        }
        client.exists(path, function (err, stat) {
            if (err) {
                return callback(err);
            }
            callback(null, stat !== null);
        });
    });
}

function zkCreatePathAndData(dto, path, data, callback) {
    zkConnectAndExecute(dto, function (err, client) {
        if (err) {
            return callback(err);
        }
        client.create(path, data, callback);
    });
}

function zkSetData(dto, path, data, callback) {
    zkConnectAndExecute(dto, function (err, client) {
        if (err) {
            return callback(err);
        }
        client.setData(path, data, callback);
    });
}

function zkGetData(dto, path, callback) {
    zkConnectAndExecute(dto, function (err, client) {
        if (err) {
            return callback(err);
        }
        client.getData(path, callback);
    });
}

function zkGetChildren(dto, path, callback) {
    zkConnectAndExecute(dto, function(err, client) {
        if (err) {
            return callback(err);
        }
        client.getChildren(path, callback);
    })
}

function setLogger(lgr) {
    logger = lgr;
}

exports.existsPath = zkExistsPath;
exports.createPathAndData = zkCreatePathAndData;
exports.setData = zkSetData;
exports.getData = zkGetData;
exports.getChildren = zkGetChildren;
exports.setLogger = setLogger;
