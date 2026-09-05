import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as argon2 from 'argon2';
import { RoleName } from '@prisma/client';

/**
 * Shared projection for every user response. Selecting explicitly (rather than
 * `include`) guarantees `passwordHash` never leaves the server.
 */
const USER_SELECT = {
  id: true,
  email: true,
  role: true,
  isActive: true,
  employeeId: true,
  createdAt: true,
  updatedAt: true,
  employee: {
    select: {
      id: true,
      name: true,
      workEmail: true,
      jobPosition: true,
      avatarUrl: true,
      department: { select: { id: true, name: true } },
    },
  },
} as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: { role?: RoleName; page?: number; limit?: number } = {}) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? params.limit : 25;
    const where = params.role ? { role: params.role } : {};

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data: users, meta: { total, page, limit } };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });

    if (!user) {
      throw new NotFoundException({ message: 'User not found', code: 'NOT_FOUND' });
    }

    return user;
  }

  async create(createUserDto: CreateUserDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException({
        message: 'A user with this email already exists.',
        code: 'EMAIL_ALREADY_EXISTS',
      });
    }

    const passwordHash = await argon2.hash(createUserDto.password);

    const user = await this.prisma.user.create({
      data: {
        email: createUserDto.email,
        passwordHash,
        role: createUserDto.role,
        employeeId: createUserDto.employeeId,
      },
      select: USER_SELECT,
    });

    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException({ message: 'User not found', code: 'NOT_FOUND' });
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: updateUserDto,
      select: USER_SELECT,
    });

    return updatedUser;
  }

  async remove(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException({ message: 'User not found', code: 'NOT_FOUND' });
    }

    // Soft delete - just deactivate
    await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
