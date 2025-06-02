import {
  Post,
  Delete,
  Route,
  Tags,
  Security,
  Request,
  Path,
  Body,
  Controller,
  Res,
  TsoaResponse,
  SuccessResponse,
  Get,
  Query,
} from "tsoa";
import { AppDataSource, Like, Comment, Tweet, User } from "./models";
import type { JwtPayload } from "./utils";
import { getCurrentUser } from "./auth.middleware";

export interface CreateCommentInput {
  text: string;
}

export interface CommentResponse {
  id: number;
  text: string;
  userId: number;
  tweetId: number;
  username: string;
  avatarUrl: string | null;
  createdAt: Date;
}

@Route("tweets/{tweetId}")
@Tags("Interactions (Likes & Comments)")
export class InteractionController extends Controller {
  // @Security('jwt')
  @SuccessResponse(201, "Liked")
  @Post("like")
  public async likeTweet(
    @Request() req: Express.Request,
    @Path() tweetId: number,
    @Res() notFoundResponse: TsoaResponse<404, { message: string }>
  ): Promise<{ message: string }> {
    // const currentUser = req.user as JwtPayload;
    const currentUser = getCurrentUser();

    const tweet = await AppDataSource.getRepository(Tweet).findOneBy({
      id: tweetId,
    });
    if (!tweet) return notFoundResponse(404, { message: "Tweet not found." });

    const user = await AppDataSource.getRepository(User).findOneBy({
      id: currentUser.userId,
    });
    if (!user) throw new Error("User not found");

    const like = Like.create({ tweet, user, tweetId, userId: user.id });
    await like.save();

    return { message: "Tweet liked successfully" };
  }

  // @Security('jwt')
  @SuccessResponse(200, "Unliked")
  @Delete("unlike")
  public async unlikeTweet(
    @Request() req: Express.Request,
    @Path() tweetId: number
  ): Promise<{ message: string }> {
    // const currentUser = req.user as JwtPayload;
    const currentUser = getCurrentUser();

    await AppDataSource.getRepository(Like).delete({
      tweetId,
      userId: currentUser.userId,
    });

    return { message: "Tweet unliked successfully" };
  }

  // @Security('jwt')
  @SuccessResponse(201, "Comment Created")
  @Post("comments")
  public async createComment(
    @Request() req: Express.Request,
    @Path() tweetId: number,
    @Body() body: CreateCommentInput,
    @Res() notFoundResponse: TsoaResponse<404, { message: string }>
  ): Promise<CommentResponse> {
    // const currentUser = req.user as JwtPayload;
    const currentUser = getCurrentUser();

    const tweet = await AppDataSource.getRepository(Tweet).findOneBy({
      id: tweetId,
    });
    if (!tweet) return notFoundResponse(404, { message: "Tweet not found." });

    const user = await AppDataSource.getRepository(User).findOneBy({
      id: currentUser.userId,
    });
    if (!user) throw new Error("User not found");

    const comment = Comment.create({
      tweet,
      user,
      tweetId,
      userId: user.id,
      content: body.text,
    });
    const saved = await comment.save();

    return {
      id: saved.id,
      text: saved.content,
      userId: saved.userId,
      tweetId: saved.tweetId,
      username: user.username,
      avatarUrl: user.avatarUrl,
      createdAt: saved.createdAt,
    };
  }

  @Get("comments")
  public async getComments(
    @Path() tweetId: number,
    @Query() limit: number = 10,
    @Query() offset: number = 0,
    @Res() notFoundResponse: TsoaResponse<404, { message: string }>
  ): Promise<CommentResponse[]> {
    const tweet = await AppDataSource.getRepository(Tweet).findOneBy({
      id: tweetId,
    });
    if (!tweet) return notFoundResponse(404, { message: "Tweet not found." });

    const comments = await AppDataSource.getRepository(Comment).find({
      where: { tweetId },
      relations: ["user"],
      order: { createdAt: "DESC" },
      take: limit,
      skip: offset,
    });

    return comments.map((c) => ({
      id: c.id,
      text: c.content,
      userId: c.userId,
      tweetId: c.tweetId,
      username: c.user?.username || "unknown",
      avatarUrl: c.user?.avatarUrl || null,
      createdAt: c.createdAt,
    }));
  }
}
