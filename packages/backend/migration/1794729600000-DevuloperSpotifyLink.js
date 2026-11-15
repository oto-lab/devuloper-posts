/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Fork-only (oto-lab/devuloper-posts): Spotify refresh tokens for %%np%%.
// Kept out of the user and registry tables so that no API can return them.
export class DevuloperSpotifyLink1794729600000 {
	name = 'DevuloperSpotifyLink1794729600000';

	async up(queryRunner) {
		await queryRunner.query(`CREATE TABLE "devuloper_spotify_link" ("userId" character varying(32) NOT NULL, "refreshToken" character varying(1024) NOT NULL, "spotifyUserName" character varying(256), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_devuloper_spotify_link" PRIMARY KEY ("userId"))`);
		await queryRunner.query(`ALTER TABLE "devuloper_spotify_link" ADD CONSTRAINT "FK_devuloper_spotify_link_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP TABLE "devuloper_spotify_link"`);
	}
}
