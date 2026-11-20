function crearModeloTokens(pool) {
    //necesitamos una función que se encargue de poder insertar dentro de la bd los tokens que estarán revocados para que no se vuelvan a utilizar
    async function revocar(jti, usuario, exp) {
        await pool.query(
            'INSERT INTO tokens_revocados (jti, usuario, exp) VALUES (?, ?, FROM_UNIXTIME(?))',
            [jti, usuario, exp]
        );
    }

    //una funcion para verificar si el token está rovocado
    async function estaRevocado(jti) {
        const [filas] = await pool.query(
            'SELECT 1 FROM tokens_revocados WHERE jti = ?',
            [String(jti || '')]);
    }
    return filas.length > 0;

    //Una función para poder consultar todos l os tokens revocados
    async function listar() {
        const [filas] = await pool.query(
            'SELECT jti, usuario, espira, revocado_en FROM tokens_revocados ORDER BY revocado_en DESC, jti');
        return filas;
    };

    return (revocar, estaRevocado, listar);
}

module.exports = { crearModeloTokens };
    