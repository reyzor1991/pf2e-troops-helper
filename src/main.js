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
    const inCombat = game.combat?.turns?.find(a=>a.token.id === _token.id);
    await game.scenes.active.deleteEmbeddedDocuments("Token", [_token.id]);

    await actorOrigin.update({
        prototypeToken: {actorLink: true},
        system: {
            traits: { size: {value: 'med'} },
            attributes: {hp: {value: actorOrigin.system.attributes.hp.max }}
        },
        flags: {
            [moduleName]: {
                isTroop: true,
                firstStage: false,
                secondStage: false,
            }
        }
    });

    actorOrigin.itemTypes.effect.forEach(e=>e.delete());
    actorOrigin.itemTypes.affliction.forEach(e=>e.delete());
    actorOrigin.itemTypes.condition.forEach(e=>e.delete());

    let tokens = [];
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

    tokens = await game.scenes.active.createEmbeddedDocuments("Token", tokens);
    if (inCombat) {
        await game.combat.createEmbeddedDocuments("Combatant", [
            {
                tokenId: tokens[0].id,
                initiative:inCombat.initiative,
            },
        ])
    }
}

Hooks.once("init", () => {
    game.pf2etroopshelper = mergeObject(game.pf2etroopshelper ?? {}, {
        "formUp": formUp,
        "createTroop": createTroop,
    });
    canvasDistance = canvas.dimensions?.size ?? 100
});

Hooks.on('getSceneControlButtons', function addControl(sceneControls) {
    if (!game.user.isGM) {return;}

    const tokenControl = sceneControls.find((c) => c.name === 'token');
    tokenControl.tools.push({
        name: 'troop-army',
        title: 'Create Troop',
        icon: 'fas fa-people-arrows',
        button: true,
        onClick: () => createTroop(),
    });
});

Hooks.on('preDeleteToken', (token, data) => {
    if (!game.combat) {return}
    if (!token.actorLink) {return}
    if (!token.actor?.getFlag(moduleName, "isTroop")) {return}

    if ( token.actor.system.attributes.hp.value > 0 && game.combat.turns.find(a=>a.token.id === token.id) ) {
        ui.notifications.info('This token cannot be deleted. Token in initiative tracker.');
        return false
    }
})

Hooks.on('preUpdateActor', async (actor, data, diff, id) => {
    if (!actor.getFlag(moduleName, "isTroop")) {return}
    if (data?.system?.attributes?.hp) {
        const perc = (data.system.attributes.hp.value/actor.system.attributes?.hp.max).toFixed(2);
        if (perc <= 0.33 && !actor.getFlag(moduleName, "secondStage")) {
            //inform about 1/3
            await actor.setFlag(moduleName, "secondStage", true);

            let value = 4;
            if (!actor.getFlag(moduleName, "firstStage")) {
                await actor.setFlag(moduleName, "firstStage", true);
                value = 8;
            }

            ChatMessage.create({
                type: CONST.CHAT_MESSAGE_TYPES.OOC,
                content: `Please delete ${value} tokens, troop HP reduced to 1/3`,
                whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id)
            });

        } else if (perc <= 0.66 && !actor.getFlag(moduleName, "firstStage")) {
            //inform about 2/3
            await actor.setFlag(moduleName, "firstStage", true);

            ChatMessage.create({
                type: CONST.CHAT_MESSAGE_TYPES.OOC,
                content: `Please delete 4 tokens, troop HP reduced to 2/3`,
                whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id)
            });
        }

    }
});