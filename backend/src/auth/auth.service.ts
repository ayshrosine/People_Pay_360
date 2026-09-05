import { Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

/**
 * `expiresIn` is typed as a template-literal duration ("15m", "7d", ...) that a
 * value read from the environment cannot be narrowed to at compile time.
 */
type JwtExpiry = NonNullable<JwtSignOptions['expiresIn']>;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async login(loginDto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
      include: { employee: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException({ message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    }

    const isPasswordValid = await argon2
      .verify(user.passwordHash, loginDto.password)
      .catch(() => false);

    if (!isPasswordValid) {
      throw new UnauthorizedException({ message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role, user.employeeId);
    
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        // Kept flat as well as nested so this matches the shape /auth/me
        // returns; self-service scoping is keyed on it.
        employeeId: user.employeeId,
        employee: user.employee,
      },
    };
  }

  async refresh(refreshTokenDto: RefreshTokenDto) {
    try {
      const payload = this.jwtService.verify(refreshTokenDto.refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { employee: true },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException({
          message: 'Invalid refresh token',
          code: 'INVALID_REFRESH_TOKEN',
        });
      }

      const tokens = await this.generateTokens(user.id, user.email, user.role, user.employeeId);
      
      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    } catch (error) {
      throw new UnauthorizedException({
        message: 'Invalid refresh token',
        code: 'INVALID_REFRESH_TOKEN',
      });
    }
  }

  async logout(refreshTokenDto: RefreshTokenDto) {
    // In a real implementation, you would add the refresh token to a blacklist
    // For now, we'll just validate it and return success
    try {
      this.jwtService.verify(refreshTokenDto.refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async getCurrentUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      // Explicit select: `include` would return passwordHash to the client.
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        employeeId: true,
        createdAt: true,
        employee: {
          include: { department: true, workingSchedule: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException({ message: 'User not found', code: 'NOT_FOUND' });
    }

    // Leading a department is authority the role cannot express, so the client
    // needs it explicitly to know whether to offer approve/refuse at all. It is
    // a hint for the UI only - the API re-checks it per record.
    const headedDepartments = user.employeeId
      ? await this.prisma.department.findMany({
          where: { headId: user.employeeId },
          select: { id: true, name: true },
        })
      : [];

    return { ...user, headedDepartments };
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isOldPasswordValid = await argon2.verify(user.passwordHash, changePasswordDto.oldPassword);
    if (!isOldPasswordValid) {
      throw new UnauthorizedException('Invalid old password');
    }

    const newPasswordHash = await argon2.hash(changePasswordDto.newPassword);
    
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });
  }

  private async generateTokens(
    userId: string,
    email: string,
    role: string,
    employeeId: string | null,
  ) {
    const payload = { sub: userId, email, role, employeeId };

    // Lifetimes come from configuration rather than being hardcoded, so a
    // deployment can shorten them without a code change.
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: (this.configService.get<string>('JWT_ACCESS_EXPIRY') ??
          '15m') as JwtExpiry,
    });

    const refreshToken = this.jwtService.sign(
      { ...payload, tokenType: 'refresh' },
      {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: (this.configService.get<string>('JWT_REFRESH_EXPIRY') ??
            '7d') as JwtExpiry,
      },
    );

    return { accessToken, refreshToken };
  }

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password);
  }
}
