'use strict';
/* Thin Node cloud adapter: credentials are loaded on demand, upload logic is shared. */
const auth = require('./rtdt_cloud_auth_node');
const cloud = require('./rtdt_cloud_storage');
module.exports = {
    create_writer:function (provider,path) {

        return cloud.create_writer(provider,path,auth.get_access_token);
    },
    split_path:cloud.split_path
};
