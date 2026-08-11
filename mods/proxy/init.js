module.exports = async (server) => {

    const { api, env, handler, path, util } = server;

    server.inject("kiri", "main.js");

    if (!(env.debug || env.electron)) {
        util.log('not a valid context for proxy');
        return;
    }

    path.full({
        "/printer/print/start": proxy_post,
        "/server/files/upload": proxy_post,
        "/api/files/local": proxy_post,
    });
};

function proxy_post(req, res, next) {
    handler.addCORS(req, res);
    if (req.method === 'POST') {
        let { url, headers } = req;
        let chunks = [];
        let host = headers['x-host'];
        let apik = headers['x-api-key'] ?? '';
        let cont = headers['content-type']  ?? 'application/binary';
        req
            .on('data', data => chunks.push(data) )
            .on('end', () => {
                req.app.post = Buffer.concat(chunks);
                if (host) {
                    fetch(host + url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': cont,
                            'X-Api-Key': apik
                        },
                        body: req.app.post
                    }).then(result => {
                        if (result.ok) {
                            res.writeHead(200, 'OK');
                        } else {
                            res.writeHead(500, 'Failed to proxy');
                            console.log({ result });
                        }
                        res.end();
                    });
                } else {
                    console.log('drop proxy due to lack of host', { chunks: chunks.map(c => c.toString()) });
                }
            });
    } else {
        next();
    }
}
