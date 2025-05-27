import {
  Body,
  Get,
  Post as HttpPost,
  Route,
  Tags,
  Security,
  Request,
  Path,
  Query,
  Controller,
  Res,
  TsoaResponse,
  SuccessResponse,
} from 'tsoa';
import { AppDataSource } from './models';
import { Tweet, User } from './models';
import { uploadBase64ToObjectStorage } from './objectstorage.service';
import type { JwtPayload } from './utils';

export interface CreateTweetBase64Input {
  imageBase64: string;
  imageFileType: string;
  tweetText?: string;
}

export interface TweetResponse {
  id: number;
  imageUrl: string;
  tweetText: string | null;
  createdAt: Date;
  userId: number;
  username: string;
  avatarUrl: string | null;
}

@Route('tweets')
@Tags('Tweets')
export class TweetController extends Controller {
  @Security('jwt')
  @HttpPost('')
  @SuccessResponse(200, 'Tweet Created')
  public async createTweet(
    @Request() req: Express.Request,
    @Body() body: CreateTweetBase64Input,
    @Res() badRequestResponse: TsoaResponse<400, { message: string }>,
    @Res() serverErrorResponse: TsoaResponse<500, { message: string }>,
  ): Promise<TweetResponse> {
    const currentUser = req.user as JwtPayload;

    if (!body.imageBase64 || !body.imageFileType.startsWith('image/')) {
      return badRequestResponse(400, {
        message: 'imageBase64 and a valid imageFileType are required.',
      });
    }

    let base64Data = body.imageBase64;
    const prefixMatch = body.imageBase64.match(/^data:(image\/\w+);base64,/);
    if (prefixMatch) {
      base64Data = body.imageBase64.substring(prefixMatch[0].length);
    }

    try {
      const uploadResult = await uploadBase64ToObjectStorage(
        base64Data,
        body.imageFileType,
      );

      const tweetRepo = AppDataSource.getRepository(Tweet);
      const newTweet = tweetRepo.create({
        userId: currentUser.userId,
        imageUrl: uploadResult.objectUrl,
        tweetText: body.tweetText || null,
      });
      const savedTweet = await tweetRepo.save(newTweet);

      const user = await AppDataSource.getRepository(User).findOneBy({
        id: currentUser.userId,
      });

      this.setStatus(200);
      return {
        ...savedTweet,
        username: user?.username || 'unknown',
        avatarUrl: user?.avatarUrl || null,
      };
    } catch (error: any) {
      console.error('Tweet creation failed:', error);
      return serverErrorResponse(500, {
        message: error.message || 'Failed to create tweet.',
      });
    }
  }

  @Get('')
  public async getFeedTweets(
    @Query() limit: number = 10,
    @Query() offset: number = 0,
  ): Promise<TweetResponse[]> {
    const tweets = await AppDataSource.getRepository(Tweet).find({
      relations: ['user'],
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return tweets.map((tweet) => ({
      id: tweet.id,
      imageUrl: tweet.imageUrl,
      tweetText: tweet.tweetText,
      createdAt: tweet.createdAt,
      userId: tweet.userId,
      username: tweet.user?.username || 'unknown',
      avatarUrl: tweet.user?.avatarUrl || null,
    }));
  }

  @Get('search')
  public async searchTweets(
    @Query() query: string,
    @Query() limit: number = 10,
    @Query() offset: number = 0,
    @Res() badRequestResponse: TsoaResponse<400, { message: string }>,
  ): Promise<TweetResponse[]> {
    if (!query.trim()) {
      return badRequestResponse(400, {
        message: 'Search query cannot be empty',
      });
    }
    const searchTerm = query.trim().split(/\s+/).join(' & ');

    const tweets = await AppDataSource.getRepository(Tweet)
      .createQueryBuilder('tweet')
      .leftJoinAndSelect('tweet.user', 'user')
      .where('to_tsvector(tweet.tweetText) @@ plainto_tsquery(:query)', {
        query: searchTerm,
      })
      .orderBy('tweet.createdAt', 'DESC')
      .take(limit)
      .skip(offset)
      .getMany();

    return tweets.map((tweet) => ({
      id: tweet.id,
      imageUrl: tweet.imageUrl,
      tweetText: tweet.tweetText,
      createdAt: tweet.createdAt,
      userId: tweet.userId,
      username: tweet.user?.username || 'unknown',
      avatarUrl: tweet.user?.avatarUrl || null,
    }));
  }

  @Get('{tweetId}')
  public async getTweetById(
    @Path() tweetId: number,
    @Res() notFoundResponse: TsoaResponse<404, { message: string }>,
  ): Promise<TweetResponse> {
    const tweet = await AppDataSource.getRepository(Tweet).findOne({
      where: { id: tweetId },
      relations: ['user'],
    });

    if (!tweet) {
      return notFoundResponse(404, { message: 'Tweet not found' });
    }

    return {
      id: tweet.id,
      imageUrl: tweet.imageUrl,
      tweetText: tweet.tweetText,
      createdAt: tweet.createdAt,
      userId: tweet.userId,
      username: tweet.user?.username || 'unknown',
      avatarUrl: tweet.user?.avatarUrl || null,
    };
  }
}
