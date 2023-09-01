const moduleName = "pf2e-troops-helper";

let canvasDistance = 100;

async function formUp() {
    if (!game.user.isGM) {
        ui.notifications.info(`Only GM can run script`);
        return
    }
    if (!_token) {ui.notifications.info("Need create select token");return;}
    const tokens = _token.actor.getActiveTokens().sort((a,b) => (a === _token) ? -1 : 1);
    const topLeft = {x: _token.document.x, y: _token.document.y};
    const updates = [];
    let i=0;
    for(let y = 0; y < 4; y++) {
      for(let x = 0; x < 4; x++) {
        const token = tokens[i];
        i++;
        if(!token) continue;
        updates.push({_id: token.id, x: topLeft.x + x * canvas.grid.size, y: topLeft.y + y * canvas.grid.size});
      }
    }
    return canvas.scene.updateEmbeddedDocuments("Token", updates);
}

async function createTroop() {
    if (!game.user.isGM) {
        ui.notifications.info(`Only GM can run script`);
        return
    }
    if (!_token) {ui.notifications.info("Need create select token");return;}

    const originX = _token.x;
    const originY = _token.y;

    const actorOrigin = await fromUuid(`Actor.${_token.actor.id}`);
    await actorOrigin.update( {prototypeToken: {actorLink: true}} );
    await actorOrigin.update( {system: {traits: {size: {value: 'med'}}}} );
    await actorOrigin.update( {system: {attributes: {hp: {value: actorOrigin.system.attributes.hp.max }}}} );
    actorOrigin.itemTypes.effect.forEach(e=>e.delete());
    actorOrigin.itemTypes.affliction.forEach(e=>e.delete());
    await game.scenes.active.deleteEmbeddedDocuments("Token", [_token.id]);

    const tokens = [];
    let i=0;
    for(let y = 0; y < 4; y++) {
        for(let x = 0; x < 4; x++) {
            tokens.push(
                (await actorOrigin.getTokenDocument({
                x: originX + x * canvasDistance,
                y: originY + y * canvasDistance,
                })).toObject()
            )
        }
    }
    await game.scenes.active.createEmbeddedDocuments("Token", tokens);
}

Hooks.once("init", () => {
    game.pf2etroopshelper = mergeObject(game.pf2etroopshelper ?? {}, {
        "formUp": formUp,
        "createTroop": createTroop,
    });
    canvasDistance = canvas.dimensions?.size ?? 100
});