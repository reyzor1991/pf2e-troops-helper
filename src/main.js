const moduleName = "pf2e-troops-helper";

function getAllCoordinates(x, y, width) {
    const size = canvas.dimensions.size;

    const startY = y;
    const arr = [];

    for (let i = 0; i < width; i++) {
        for (let j = 0; j < width; j++) {
            arr.push({x, y});
            y += size;
        }
        y = startY;
        x += size;
    }
    return arr
};

const newCoords = [
    {x: -1, y: 0},
    {x: -2, y: 0},
    {x: -3, y: 0},
    {x: 1, y: 0},
    {x: 2, y: 0},
    {x: 3, y: 0},

    {x: -1, y: 1},
    {x: -2, y: 1},
    {x: -3, y: 1},
    {x: 0, y: 1},
    {x: 1, y: 1},
    {x: 2, y: 1},
    {x: 3, y: 1},
    {x: -1, y: -1},
    {x: -2, y: -1},
    {x: -3, y: -1},
    {x: 0, y: -1},
    {x: 1, y: -1},
    {x: 2, y: -1},
    {x: 3, y: -1},

    {x: -1, y: 2},
    {x: -2, y: 2},
    {x: 0, y: 2},
    {x: 1, y: 2},
    {x: 2, y: 2},
    {x: -1, y: -2},
    {x: -2, y: -2},
    {x: 0, y: -2},
    {x: 1, y: -2},
    {x: 2, y: -2},

    {x: -1, y: 3},
    {x: 0, y: 3},
    {x: 1, y: 3},
    {x: -1, y: -3},
    {x: 0, y: -3},
    {x: 1, y: -3},
]

async function formUp(token) {
    if (!game.user.isGM) {
        ui.notifications.info(`Only GM can run script`);
        return
    }
    if (!token) {
        ui.notifications.info("Need create select token");
        return;
    }
    let canvasDistance = canvas.dimensions?.size ?? 100
    const tokensForUpdate = token.actor.getActiveTokens().filter(t => t != token);
    const occupied = token.scene.tokens
        .filter(t => !tokensForUpdate.includes(t.object) && t.object != token)
        .map(t => getAllCoordinates(t.x, t.y, t.width)).flat()
        .map(a => JSON.stringify(a));

    let newPossibleLocations = foundry.utils.deepClone(newCoords).map(c => {
        return {
            x: token.x + c.x * canvasDistance,
            cx: token.center.x + c.x * canvasDistance,
            y: token.y + c.y * canvasDistance,
            cy: token.center.y + c.y * canvasDistance
        }
    });

    let availableLocations = newPossibleLocations.filter(coo => {
        return !CONFIG.Canvas.polygonBackends.move.testCollision(token.center, {x: coo.cx, y: coo.cy}, {
            type: 'move',
            mode: 'any'
        })
    }).filter(target => {
        return !occupied.includes(JSON.stringify({x: target.x, y: target.y}));
    });

    for (let i = 0; i < tokensForUpdate.length; i++) {
        if (!availableLocations.length) {
            continue
        }
        let ttt = tokensForUpdate[i];
        let nn = availableLocations.shift();
        await ttt.document.update({x: nn.x, y: nn.y})
    }
    ui.notifications.info(`Troop formed Up`);
}

async function createTroop(token, count = 16) {
    if (!game.user.isGM) {
        ui.notifications.info(`Only GM can run script`);
        return
    }
    if (!token) {
        ui.notifications.info("Need create select token");
        return;
    }
    if (!count || count < 0 || count > 16) {
        ui.notifications.info("Copies of token should be up to 16");
        return;
    }

    let canvasDistance = token?.scene?.grid?.size ?? 100

    const originX = token.x;
    const originY = token.y;

    const actorOrigin = await fromUuid(`Actor.${token.actor.id}`);
    const inCombat = game.combat?.turns?.find(a => a.token.id === token.id);
    if (token.scene.tokens.has(token.id)) {
        await token.scene.deleteEmbeddedDocuments("Token", [token.id]);
    }

    await actorOrigin.update({
        prototypeToken: {actorLink: true},
        system: {
            traits: {size: {value: 'med'}}
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
    for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
            tokens.push(
                (await actorOrigin.getTokenDocument({
                    x: originX + x * canvasDistance,
                    y: originY + y * canvasDistance,
                })).toObject()
            )
            if (tokens.length === count) {
                break;
            }
        }
        if (tokens.length === count) {
            break;
        }
    }

    tokens = await token.scene.createEmbeddedDocuments("Token", tokens);
    if (inCombat) {
        await game.combat.createEmbeddedDocuments("Combatant", [
            {
                tokenId: tokens[0].id,
                initiative: inCombat.initiative,
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
        "createTroop": async function (token) {
            const {count} = await Dialog.wait({
                title: "Select number of tokens (up to 16)",
                content: `
                    <input type="number" id="count" value="16"/>
                `,
                buttons: {
                    ok: {
                        label: "Create",
                        icon: '<i class="fa-thin fa-location-arrow"></i>',
                        callback: (html) => {
                            return {count: $(html).find('#count').val()}
                        }
                    },
                    cancel: {
                        label: "Cancel",
                        icon: "<i class='fa-solid fa-ban'></i>",
                    }
                },
                default: "ok"
            });
            if (!count) {
                return
            }
            createTroop(token, Number(count));
        },
    });
});

class ReyzorLayer extends InteractionLayer {
    constructor() {
        super();
    }
}

Hooks.on("canvasReady", (canvas) => {
    if (!canvas.reyzorLayer) {
        canvas.reyzorLayer = new ReyzorLayer()
    }
});

Hooks.on('getSceneControlButtons', (sceneControls) => {
    if (!game.user.isGM) {
        return;
    }

    let tools = [
        {
            name: 'troop-army',
            title: 'Create Troop',
            icon: 'fas fa-people-arrows',
            button: true,
            onClick: () => createTroop(canvas.tokens.controlled[0]),
        }
    ]

    const control = sceneControls.find(b => b.name === "reyzorMods");
    if (!control) {
        sceneControls.push({
            name: 'reyzorMods',
            title: "Reyzor's Mods",
            icon: 'fa-solid fa-user-gear',
            layer: 'reyzorLayer',
            tools
        });
    } else {
        control.tools.push(...tools);
    }
});

Hooks.on('preDeleteToken', (token, data) => {
    if (!game.combat) {
        return
    }
    if (!token.actorLink) {
        return
    }
    if (!token.actor?.getFlag(moduleName, "isTroop")) {
        return
    }

    if (token.actor.system.attributes.hp.value > 0 && game.combat.turns.find(a => a.token.id === token.id)) {
        ui.notifications.info('This token cannot be deleted. Token in initiative tracker.');
        return false
    }
})

Hooks.on('preUpdateActor', async (actor, data, diff, id) => {
    if (!actor.getFlag(moduleName, "isTroop")) {
        return
    }
    if (data?.system?.attributes?.hp) {
        const perc = (data.system.attributes.hp.value / actor.system.attributes?.hp.max).toFixed(2);
        if (perc <= 0.33 && !actor.getFlag(moduleName, "secondStage")) {
            //inform about 1/3
            await actor.setFlag(moduleName, "secondStage", true);

            let value = 4;
            if (!actor.getFlag(moduleName, "firstStage")) {
                await actor.setFlag(moduleName, "firstStage", true);
                value = 8;
            }

            if (game.settings.get(moduleName, "autoDelete")) {
                let cTokens = game.combat?.turns?.map(a => a.token.id) || [];
                actor.getActiveTokens().filter(t => !cTokens.includes(t.id)).slice(0, value).forEach(t => {
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
                let cTokens = game.combat?.turns?.map(a => a.token.id) || [];
                actor.getActiveTokens().filter(t => !cTokens.includes(t.id)).slice(0, 4).forEach(t => {
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