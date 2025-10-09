export interface SessionInfo {
	userId: number;
	username: string;
	display_name: string;
	profilePicture: string;
	email_verified: number;
	email: string;
	type: "access";
	exp: number;
	jti: string;
	admin: 0 | 1;
	internal: 0 | 1;
	preferences: {
		timezone: string;
		dateFormat: string;
		firstDay: string;
	};
}

export interface UserProfile {
	id: number;
	username: string;
	email: string | null;
	email_visible: "public" | "connections" | "private";
	display_name: string | null;
	avatar_url: string | null;
	description: string | null;
	admin: number;
	internal: number;
	created_at: Date;
	timezone: string | null;
	timezone_visible: "public" | "connections" | "private";
}

export interface ProfileResponse {
	profile: UserProfile;
	isFriend: boolean;
	isSelf: boolean;
	isPending: boolean;
}

export interface session {
	id: number;
	user_id: number;
	user_agent: string;
	ip_address: string;
	jwt_id: string;
	expires_at: string;
	created_at: string;
	last_updated: string;

	created_at_fmt?: string;
	last_updated_fmt?: string;
	expires_at_fmt?: string;
}

// Kanban
export interface Card {
	id: number;
	list_id: number;
	name: string;
	created_at: string;
	owner: number;
	is_archived: boolean;
}

export interface List {
	id: number;
	name: string;
	position: number;
	cards: Card[];
}

export interface Board {
	id: number;
	name: string;
	owner: number;
	is_public: boolean;
	background_url: string;
}

export type BoardMeta = { name?: string; background_url?: string; [key: string]: any };
