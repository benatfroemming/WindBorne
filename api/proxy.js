export default async function handler(req, res) {
    const { file } = req.query; 
    const url = `https://a.windbornesystems.com/treasure/${file}`;

    try {
        const response = await fetch(url);
        const data = await response.text();

        res.setHeader('Access-Control-Allow-Origin', '*'); 
        res.status(200).send(data);
    } catch (err) {
        res.status(500).send({ error: 'Failed to fetch API' });
    }
}
