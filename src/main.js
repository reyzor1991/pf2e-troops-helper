const moduleName = "pf2e-troops-helper";

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

async function createTroop(count=16) {
    if (!game.user.isGM) {
        ui.notifications.info(`Only GM can run script`);
        return
    }
    if (!_token) {ui.notifications.info("Need create select token");return;}
    if (!count || count < 0 || count > 16) { ui.notifications.info("Copies of token should be up to 16");return; }

    let canvasDistance = _token?.scene?.grid?.size ?? 100

    const originX = _token.x;
    const originY = _token.y;

    const actorOrigin = await fromUuid(`Actor.${_token.actor.id}`);
    const inCombat = game.combat?.turns?.find(a=>a.token.id === _token.id);
    if (_token.scene.tokens.has(_token.id)) {
        await _token.scene.deleteEmbeddedDocuments("Token", [_token.id]);
    }

    await actorOrigin.update({
        prototypeToken: {actorLink: true},
        system: {
            traits: { size: {value: 'med'} }
        },
        flags: {
            [moduleName]: {
                isTroop: true,
                firstStage: false,
                secondStage: false,
            }
        }
    });

    let tokens = [];
    for(let y = 0; y < 4; y++) {
        for(let x = 0; x < 4; x++) {
            tokens.push(
                (await actorOrigin.getTokenDocument({
                    x: originX + x * canvasDistance,
                    y: originY + y * canvasDistance,
                })).toObject()
            )
            if (tokens.length === count) { break; }
        }
        if (tokens.length === count) { break; }
    }

    tokens = await _token.scene.createEmbeddedDocuments("Token", tokens);
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
    game.settings.register(moduleName, "autoDelete", {
        scope: "world",
        config: true,
        name: "Auto delete tokens",
        default: false,
        type: Boolean,
    });

    game.pf2etroopshelper = foundry.utils.mergeObject(game.pf2etroopshelper ?? {}, {
        "formUp": formUp,
        "createTroop": async function() {
            const { count } = await Dialog.wait({
                title: "Select number of tokens (up to 16)",
                content: `
                    <input type="number" id="count" value="16"/>
                `,
                buttons: {
                    ok: {
                        label: "Create",
                        icon: '<i class="fa-thin fa-location-arrow"></i>',
                        callback: (html) => { return { count: $(html).find('#count').val() } }
                    },
                    cancel: {
                        label: "Cancel",
                        icon: "<i class='fa-solid fa-ban'></i>",
                    }
                },
                default: "ok"
            });
            if (!count) { return }
            createTroop(Number(count));
        },
    });
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

            if (game.settings.get(moduleName, "autoDelete")) {
                let cTokens = game.combat?.turns?.map(a=>a.token.id) || [];
                actor.getActiveTokens().filter(t=>!cTokens.includes(t.id)).slice(0, value).forEach(t=>{
                    t.document.delete()
                })

                ChatMessage.create({
                    type: CONST.CHAT_MESSAGE_TYPES.OOC,
                    content: `${value} tokens were deleted, troop HP reduced to 1/3`,
                    whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id)
                });
            } else {
                ChatMessage.create({
                    type: CONST.CHAT_MESSAGE_TYPES.OOC,
                    content: `Please delete ${value} tokens, troop HP reduced to 1/3`,
                    whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id)
                });
            }
        } else if (perc <= 0.66 && !actor.getFlag(moduleName, "firstStage")) {
            //inform about 2/3
            await actor.setFlag(moduleName, "firstStage", true);

            if (game.settings.get(moduleName, "autoDelete")) {
                let cTokens = game.combat?.turns?.map(a=>a.token.id) || [];
                actor.getActiveTokens().filter(t=>!cTokens.includes(t.id)).slice(0, 4).forEach(t=>{
                    t.document.delete()
                })

                ChatMessage.create({
                    type: CONST.CHAT_MESSAGE_TYPES.OOC,
                    content: `4 tokens were deleted, troop HP reduced to 2/3`,
                    whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id)
                });
            } else {
                ChatMessage.create({
                    type: CONST.CHAT_MESSAGE_TYPES.OOC,
                    content: `Please delete 4 tokens, troop HP reduced to 2/3`,
                    whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id)
                });
            }
        }

    }
});